import { personEntityKey } from "@/lib/memory/entities";
import { isTextRelevantToQuery } from "@/lib/memory/memory-relevance";
import { expandMemoryQuery } from "@/lib/memory/query-expansion";
import { isCoreIdentityFact } from "@/lib/memory/memory-layers";
import { CORE_PREDICATES, isSensitiveFact } from "@/lib/memory/predicates";
import { isProtectedFact } from "@/lib/memory/authority";
import {
  assembleClientMemoryPackSync,
  countPackFacts,
  serializeClientMemoryPack,
  type ClientMemoryPack,
} from "@/lib/memory/client-memory-pack";
import { memoryBudgetFor, resolveMemoryDepth } from "@/lib/memory/memory-budget";
import { parseExtractedFactPayload } from "@/lib/memory/extract-facts";
import { filterGroundedFacts } from "@/lib/memory/grounding";
import type { FactInput, UserFact } from "@/lib/memory/user-facts";
import type {
  CaptureTurn,
  GoldenFact,
  MemoryStore,
  RetrievalQuery,
} from "./types";

export const KEY = {
  sergey: personEntityKey("Сергей")!,
  sergeyEx: personEntityKey("Сергей", "former_spouse")!,
  sergeyCol: personEntityKey("Сергей", "коллега")!,
  sergeyDoc: personEntityKey("Сергей Петров", "врач")!,
  anton: personEntityKey("Антон")!,
  antonPartner: personEntityKey("Антон", "partner")!,
  artem: personEntityKey("Артём", "child")!,
  marina: personEntityKey("Марина", "parent")!,
};

export function gf(
  id: string,
  fact: string,
  predicateKey: string,
  over: Partial<GoldenFact> = {}
): GoldenFact {
  const evidenceQuote = over.evidenceQuote ?? fact.slice(0, 80);
  return {
    id,
    fact,
    predicateKey,
    entityKey: over.entityKey ?? null,
    status: over.status ?? "active",
    archiveTier: over.archiveTier ?? "hot",
    eventDate: over.eventDate ?? null,
    captureTier: over.captureTier ?? "durable",
    sourceType: over.sourceType ?? "chat",
    sourceCharacter: over.sourceCharacter ?? null,
    salience: over.salience ?? 3,
    category: over.category ?? "other",
    evidenceQuote,
    sensitivity: over.sensitivity ?? "normal",
    subjectKey: over.subjectKey ?? "client",
    markers: over.markers ?? [fact.slice(0, 28)],
    critical: over.critical,
    manual: over.manual,
  };
}

export function toUserFact(g: GoldenFact): UserFact {
  return {
    id: g.id,
    fact: g.fact,
    category: g.category,
    eventDate: g.eventDate ?? null,
    sourceCharacter: g.sourceCharacter ?? null,
    salience: g.salience,
    status: g.status,
    predicateKey: g.predicateKey,
    entityKey: g.entityKey ?? null,
    subjectKey: g.subjectKey ?? "client",
    sensitivity: g.sensitivity,
    confidence: g.captureTier === "draft" ? 0.75 : 0.95,
    sourceType: g.sourceType,
    evidenceQuote: g.evidenceQuote,
    captureTier: g.captureTier,
    archiveTier: g.archiveTier,
  };
}

export function toModelJson(turn: CaptureTurn): string {
  const rows = [
    ...turn.goldFacts.map((f) => ({
      fact: f.fact,
      category: f.category,
      eventDate: f.eventDate ?? null,
      salience: f.salience,
      predicateKey: f.predicateKey,
      entityKey: f.entityKey ?? null,
      subjectKey: f.subjectKey ?? "client",
      operation: "add",
      sensitivity: f.sensitivity,
      confidence: 0.95,
      evidenceQuote: f.evidenceQuote,
    })),
    ...(turn.contamination ?? []).map((c) => ({
      fact: c.fact,
      category: "other",
      eventDate: null,
      salience: 3,
      predicateKey: c.predicateKey ?? "other",
      entityKey: null,
      subjectKey: "client",
      operation: "add",
      sensitivity: "normal",
      confidence: 0.95,
      evidenceQuote: c.evidenceQuote,
    })),
  ];
  return JSON.stringify(rows);
}

export function runCapturePipeline(turn: CaptureTurn): FactInput[] {
  const parsed = parseExtractedFactPayload(toModelJson(turn));
  return filterGroundedFacts(turn.userMessage, parsed);
}

function archiveOk(fact: UserFact, includeArchived: boolean): boolean {
  if (includeArchived) return true;
  return fact.archiveTier !== "archived";
}

function statusOk(fact: UserFact, includeSuperseded: boolean): boolean {
  if (fact.status === "active") return true;
  return includeSuperseded && fact.status === "superseded";
}

function take<T>(rows: T[], n: number): T[] {
  return rows.slice(0, Math.max(0, n));
}

/** Mirror production candidate fetch without DB/embeddings (lexical stand-in for searchFacts). */
export function selectCandidates(
  store: MemoryStore,
  queryText: string
): { candidates: UserFact[]; expansion: ReturnType<typeof expandMemoryQuery> } {
  const known = [
    ...new Set(store.map((f) => f.entityKey).filter((k): k is string => Boolean(k))),
  ];
  const expansion = expandMemoryQuery(queryText, known);
  const includeArchived = expansion.entityKeys.length > 0 || expansion.wantsTimeline;

  const core = take(
    store
      .filter(
        (f) =>
          f.status === "active" &&
          archiveOk(f, false) &&
          (Boolean(f.predicateKey && CORE_PREDICATES.has(f.predicateKey)) ||
            f.captureTier === "user_confirmed" ||
            f.sourceType === "user" ||
            f.sourceCharacter === "user")
      )
      .sort((a, b) => {
        const ap = isProtectedFact(a) ? 0 : 1;
        const bp = isProtectedFact(b) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return b.salience - a.salience;
      }),
    12
  );

  const today = new Date();
  const upcoming = take(
    store
      .filter((f) => {
        if (f.status !== "active" || !archiveOk(f, false) || !f.eventDate) return false;
        const d = new Date(`${f.eventDate}T00:00:00Z`);
        const diff = (d.getTime() - today.getTime()) / 86_400_000;
        return diff >= 0 && diff <= 45;
      })
      .sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate))),
    5
  );

  const searched = take(
    store.filter(
      (f) =>
        f.status === "active" &&
        archiveOk(f, includeArchived) &&
        isTextRelevantToQuery(
          expansion.expandedText,
          `${f.fact} ${f.predicateKey ?? ""} ${f.entityKey ?? ""}`
        )
    ),
    16
  );

  const byEntity = expansion.entityKeys.length
    ? take(
        store.filter(
          (f) =>
            Boolean(f.entityKey && expansion.entityKeys.includes(f.entityKey)) &&
            statusOk(f, true) &&
            archiveOk(f, true)
        ),
        16
      )
    : [];

  const byPred = expansion.predicateHints.length
    ? take(
        store.filter(
          (f) =>
            Boolean(f.predicateKey && expansion.predicateHints.includes(f.predicateKey)) &&
            statusOk(f, expansion.wantsTimeline) &&
            archiveOk(f, includeArchived)
        ),
        16
      )
    : [];

  const timeline = expansion.wantsTimeline
    ? take(
        store.filter(
          (f) =>
            Boolean(f.predicateKey && expansion.predicateHints.includes(f.predicateKey)) &&
            statusOk(f, true) &&
            archiveOk(f, true)
        ),
        12
      )
    : [];

  const seen = new Set<string>();
  const candidates: UserFact[] = [];
  for (const group of [core, upcoming, searched, byEntity, byPred, timeline]) {
    for (const fact of group) {
      if (seen.has(fact.id)) continue;
      seen.add(fact.id);
      candidates.push(fact);
    }
  }
  return { candidates, expansion };
}

export function retrievePack(
  store: MemoryStore,
  query: RetrievalQuery
): { pack: ClientMemoryPack; block: string; ms: number; depth: ReturnType<typeof resolveMemoryDepth> } {
  const started = Date.now();
  const depth = resolveMemoryDepth({
    depth: query.depth,
    product: query.product,
    queryText: query.query,
  });
  const { candidates, expansion } = selectCandidates(store, query.query);
  const relevanceFlags = candidates.map((f) =>
    isTextRelevantToQuery(query.query, `${f.fact} ${f.predicateKey ?? ""} ${f.entityKey ?? ""}`)
  );
  const pack = assembleClientMemoryPackSync({
    queryText: query.query,
    candidates,
    expansion,
    depth,
    relevanceFlags,
    startedAt: started,
  });
  const budget = memoryBudgetFor(depth);
  const block = serializeClientMemoryPack(pack, budget);
  pack.metrics.memory_context_chars = block.length;
  return { pack, block, ms: Date.now() - started, depth };
}

export function packFacts(pack: ClientMemoryPack): UserFact[] {
  const seen = new Set<string>();
  const out: UserFact[] = [];
  for (const group of [
    pack.coreFacts,
    pack.currentState,
    pack.people,
    pack.timeline,
    pack.goals,
    pack.upcomingEvents,
    pack.relevantFacts,
    pack.userConfirmed,
    pack.contradictions,
  ]) {
    for (const f of group) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
  }
  return out;
}

export function factVisible(
  fact: GoldenFact,
  pack: ClientMemoryPack,
  block: string
): boolean {
  if (packFacts(pack).some((f) => f.id === fact.id)) return true;
  if (block.includes(fact.fact)) return true;
  return fact.markers.some((m) => m.length >= 6 && block.includes(m));
}

export function looksCurrent(fact: GoldenFact, pack: ClientMemoryPack): boolean {
  return [...pack.coreFacts, ...pack.currentState, ...pack.people, ...pack.relevantFacts].some(
    (f) => f.id === fact.id && f.status === "active"
  );
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function textsAlign(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" ").filter((t) => t.length >= 4));
  const tb = nb.split(" ").filter((t) => t.length >= 4);
  const hit = tb.filter((t) => ta.has(t)).length;
  return tb.length > 0 && hit / tb.length >= 0.6;
}

export function matchExtracted(gold: GoldenFact, extracted: FactInput[]): FactInput | null {
  return (
    extracted.find(
      (row) =>
        textsAlign(row.fact, gold.fact) ||
        (row.predicateKey === gold.predicateKey &&
          (row.entityKey ?? null) === (gold.entityKey ?? null) &&
          textsAlign(row.evidenceQuote ?? "", gold.evidenceQuote))
    ) ?? null
  );
}

export function storeFromMemory(facts: GoldenFact[]): MemoryStore {
  return facts.map(toUserFact);
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export { countPackFacts, isCoreIdentityFact, isSensitiveFact, isProtectedFact };
