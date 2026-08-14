import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canAutoSupersede,
  canMutateExistingFact,
  isProtectedFact,
  memoryAuthorityRank,
} from "@/lib/memory/authority";
import { classifyFactConflict } from "@/lib/memory/contradictions";
import {
  entitiesCompatibleForMerge,
  extractPersonMentions,
  mentionMatchesEntity,
  personEntityKey,
} from "@/lib/memory/entities";
import { MEMORY_SECURITY_RULES } from "@/lib/memory/injection-guard";
import { classifyMemoryLayer } from "@/lib/memory/memory-layers";
import { memoryBudgetFor } from "@/lib/memory/memory-budget";
import {
  factVisible,
  gf,
  KEY,
  looksCurrent,
  matchExtracted,
  packFacts,
  percentile,
  retrievePack,
  runCapturePipeline,
  storeFromMemory,
} from "./helpers";
import { loadGoldenDataset } from "./fixtures";
import type {
  CaptureRow,
  GoldenFact,
  QualityFailure,
  RetrievalRow,
} from "./types";

const ROOT = resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

export function evalCapture(): { rows: CaptureRow[]; failures: QualityFailure[] } {
  const rows: CaptureRow[] = [];
  const failures: QualityFailure[] = [];
  for (const scenario of loadGoldenDataset()) {
    for (const turn of scenario.turns) {
      const extracted = runCapturePipeline(turn);
      let matched = 0;
      let missed = 0;
      let wrongEntity = 0;
      let wrongPredicate = 0;
      let wrongDate = 0;
      let entityGold = 0;
      let entityHit = 0;
      let dateGold = 0;
      let dateHit = 0;
      let predicateGold = 0;
      let predicateHit = 0;
      let sensitiveGold = 0;
      let sensitiveCorrect = 0;

      for (const gold of turn.goldFacts) {
        const hit = matchExtracted(gold, extracted);
        if (!hit) {
          missed += 1;
          failures.push({
            gate: "capture_miss",
            detail: `${scenario.id}: missed «${gold.fact}» from «${turn.userMessage.slice(0, 80)}»`,
          });
          continue;
        }
        matched += 1;
        if (gold.predicateKey) {
          predicateGold += 1;
          if (hit.predicateKey === gold.predicateKey) predicateHit += 1;
          else wrongPredicate += 1;
        }
        if (gold.entityKey) {
          entityGold += 1;
          if ((hit.entityKey ?? null) === gold.entityKey) entityHit += 1;
          else wrongEntity += 1;
        }
        if (gold.eventDate) {
          dateGold += 1;
          if ((hit.eventDate ?? null) === gold.eventDate) dateHit += 1;
          else wrongDate += 1;
        }
        if (gold.sensitivity === "sensitive") {
          sensitiveGold += 1;
          if (hit.sensitivity === "sensitive") sensitiveCorrect += 1;
        }
      }

      const goldNorm = turn.goldFacts.map((g) => g.fact);
      const falseFacts = extracted.filter(
        (row) => !turn.goldFacts.some((g) => matchExtracted(g, [row]))
      ).length;
      void goldNorm;

      let predictionContamination = 0;
      if (turn.contamination?.length) {
        for (const bad of turn.contamination) {
          if (extracted.some((row) => row.fact === bad.fact || row.evidenceQuote === bad.evidenceQuote)) {
            predictionContamination += 1;
            failures.push({
              gate: "prediction_contamination",
              detail: `${scenario.id}: kept ungrounded «${bad.fact}»`,
            });
          }
        }
      }
      if (turn.assistantReply) {
        const leak = extracted.filter((row) =>
          (row.evidenceQuote ?? "").includes(turn.assistantReply!.slice(0, 20))
        );
        predictionContamination += leak.length;
      }

      rows.push({
        scenarioId: scenario.id,
        gold: turn.goldFacts.length,
        extracted: extracted.length,
        matched,
        falseFacts,
        missed,
        wrongEntity,
        wrongPredicate,
        wrongDate,
        predictionContamination,
        entityGold,
        entityHit,
        dateGold,
        dateHit,
        predicateGold,
        predicateHit,
        sensitiveGold,
        sensitiveCorrect,
      });
    }
  }
  return { rows, failures };
}

export function evalRetrieval(): { rows: RetrievalRow[]; failures: QualityFailure[] } {
  const rows: RetrievalRow[] = [];
  const failures: QualityFailure[] = [];
  for (const scenario of loadGoldenDataset()) {
    const store = storeFromMemory(scenario.memory);
    const byId = new Map(scenario.memory.map((f) => [f.id, f]));
    for (const query of scenario.queries) {
      const { pack, block, ms } = retrievePack(store, query);
      const selected = packFacts(pack);
      const mustFacts = query.mustInclude.map((id) => byId.get(id)).filter(Boolean) as GoldenFact[];
      const mustHit = mustFacts.filter((f) => factVisible(f, pack, block));
      const mustMiss = mustFacts.filter((f) => !factVisible(f, pack, block));
      const mustNotFacts = query.mustNotInclude
        .map((id) => byId.get(id))
        .filter(Boolean) as GoldenFact[];
      const mustNotViolations = mustNotFacts.filter((f) => factVisible(f, pack, block));
      const optionalFacts = (query.optional ?? [])
        .map((id) => byId.get(id))
        .filter(Boolean) as GoldenFact[];

      for (const miss of mustMiss) {
        const gate = query.archived
          ? "archived_recall"
          : query.entity
            ? "entity_recall"
            : query.manual
              ? "manual_recall"
              : query.critical
                ? "critical_recall"
                : "retrieval_recall";
        failures.push({
          gate,
          detail: `${scenario.id}/${query.id}: missing ${miss.id} «${miss.fact}»`,
        });
      }
      for (const extra of mustNotViolations) {
        failures.push({
          gate: query.entity
            ? "wrong_person"
            : query.irrelevance
              ? "irrelevant_injection"
              : "must_not_include",
          detail: `${scenario.id}/${query.id}: injected ${extra.id} «${extra.fact}»`,
        });
      }
      for (const id of query.expectCurrentNot ?? []) {
        const fact = byId.get(id);
        if (fact && looksCurrent(fact, pack)) {
          failures.push({
            gate: "timeline_correctness",
            detail: `${scenario.id}/${query.id}: ${id} shown as current`,
          });
        }
      }

      const droppedRelevant = mustMiss.length;
      rows.push({
        scenarioId: scenario.id,
        queryId: query.id,
        must: mustFacts.length,
        mustHit: mustHit.length,
        mustNot: mustNotFacts.length,
        mustNotViolations: mustNotViolations.length,
        optional: optionalFacts.length,
        optionalHit: optionalFacts.filter((f) => factVisible(f, pack, block)).length,
        criticalMiss: query.critical ? mustMiss.length : 0,
        manualMust: mustFacts.filter((f) => f.manual).length,
        manualHit: mustHit.filter((f) => f.manual).length,
        manualMiss: mustMiss.filter((f) => f.manual).length,
        entityMiss: query.entity ? mustMiss.length : 0,
        timelineMiss: query.timeline ? mustMiss.length : 0,
        archivedMiss: query.archived || query.expectArchivedRecovery ? mustMiss.length : 0,
        irrelevantHits: query.irrelevance ? mustNotViolations.length : 0,
        chars: block.length,
        selected: selected.length,
        candidates: pack.metrics.memory_candidates_count,
        droppedRelevant,
        securityPreserved: block.includes("ПРАВИЛА БЕЗОПАСНОСТИ ПАМЯТИ"),
        ms,
      });
    }
  }
  return { rows, failures };
}

export function evalAuthority(): QualityFailure[] {
  const failures: QualityFailure[] = [];
  const manual = { sourceType: "user", sourceCharacter: "user", captureTier: "user_confirmed" as const };
  const confirmed = { captureTier: "user_confirmed" as const, sourceType: "chat" };
  const auto = { sourceType: "chat", captureTier: "durable" as const, confidence: 0.95 };
  if (memoryAuthorityRank(manual) !== 1) {
    failures.push({ gate: "authority", detail: "user-authored is not rank 1" });
  }
  if (canMutateExistingFact(manual, auto) || canAutoSupersede(manual, auto)) {
    failures.push({ gate: "manual_overwrite", detail: "auto extraction can rewrite manual fact" });
  }
  if (canMutateExistingFact(confirmed, auto) || canAutoSupersede(confirmed, auto)) {
    failures.push({
      gate: "user_confirmed_overwrite",
      detail: "auto extraction can rewrite user-confirmed fact",
    });
  }
  if (!canMutateExistingFact(manual, { sourceType: "user" })) {
    failures.push({ gate: "authority", detail: "user correction cannot update manual fact" });
  }
  const kind = classifyFactConflict(
    { fact: "Клиент ищет работу", predicateKey: "employment.searching", subjectKey: "client" },
    {
      fact: "Клиент устроился менеджером",
      predicateKey: "employment.current",
      subjectKey: "client",
      operation: "replace",
    }
  );
  if (kind !== "temporal_update") {
    failures.push({ gate: "authority", detail: `job change classified as ${kind}` });
  }
  if (!isProtectedFact(manual) || !isProtectedFact(confirmed)) {
    failures.push({ gate: "authority", detail: "protected fact detector missed user/confirmed" });
  }
  return failures;
}

export function evalEntities(): QualityFailure[] {
  const failures: QualityFailure[] = [];
  const forms = ["Сергей", "Сергея", "Сергеем", "Сергею"];
  const base = personEntityKey("Сергей");
  for (const form of forms) {
    if (personEntityKey(form) !== base) {
      failures.push({ gate: "wrong_person", detail: `inflection ${form} → ${personEntityKey(form)}` });
    }
    if (!mentionMatchesEntity(form, KEY.sergeyEx)) {
      failures.push({ gate: "wrong_person", detail: `${form} does not match ${KEY.sergeyEx}` });
    }
  }
  if (
    entitiesCompatibleForMerge(
      { entityKey: KEY.sergeyEx },
      { entityKey: KEY.sergeyCol }
    )
  ) {
    failures.push({ gate: "wrong_person", detail: "ex-spouse merged with colleague" });
  }
  if (
    entitiesCompatibleForMerge(
      { entityKey: KEY.sergeyEx },
      { entityKey: KEY.sergeyDoc }
    )
  ) {
    failures.push({ gate: "wrong_person", detail: "ex-spouse merged with doctor" });
  }
  const mentions = extractPersonMentions("Что сейчас с Сергеем и с Сергеем Петровым?");
  if (!mentions.some((m) => mentionMatchesEntity(m, KEY.sergey))) {
    failures.push({ gate: "wrong_person", detail: "Сергеем mention not extracted" });
  }
  return failures;
}

export function evalTimeline(): QualityFailure[] {
  const failures: QualityFailure[] = [];
  const cases: Array<{ fact: GoldenFact; layer: string }> = [
    {
      fact: gf("t1", "Клиент ищет работу", "employment.searching", { status: "superseded" }),
      layer: "timeline",
    },
    {
      fact: gf("t2", "Клиент работает менеджером", "employment.current"),
      layer: "current_state",
    },
    {
      fact: gf("t3", "Клиент жил в Волжском", "residence.former", { status: "superseded" }),
      layer: "timeline",
    },
  ];
  for (const row of cases) {
    const got = classifyMemoryLayer(row.fact);
    if (row.fact.status === "superseded" && got !== "timeline") {
      failures.push({
        gate: "timeline_correctness",
        detail: `${row.fact.id} superseded classified as ${got}`,
      });
    }
    if (row.fact.status === "active" && row.layer === "current_state" && got !== "current_state") {
      failures.push({
        gate: "timeline_correctness",
        detail: `${row.fact.id} current classified as ${got}`,
      });
    }
  }
  return failures;
}

export function evalCrossProductStatic(): QualityFailure[] {
  const failures: QualityFailure[] = [];
  const hd = readSrc("src/lib/human-design/personalization-lens.ts");
  const natal = readSrc("src/lib/natal/personalization-lens.ts");
  const matrix = readSrc("src/lib/numerology/matrix-sectioned-reading.ts");
  if (!/не имеет права менять расчёт|не источник фактов карты/i.test(hd)) {
    failures.push({ gate: "cross_product", detail: "HD lens missing calc isolation" });
  }
  if (!/не источник фактов карты/i.test(natal)) {
    failures.push({ gate: "cross_product", detail: "Natal lens missing calc isolation" });
  }
  if (!/does not change arcana numbers/i.test(matrix)) {
    failures.push({ gate: "cross_product", detail: "Matrix reading can change arcana" });
  }
  const facts = readSrc("src/lib/memory/user-facts.ts");
  if (!facts.includes("WHERE user_id = $1")) {
    failures.push({ gate: "cross_user_leak", detail: "user_facts queries missing user_id bind" });
  }
  const consumers = [
    "src/lib/services/chat-orchestrator.ts",
    "src/app/api/reading/route.ts",
    "src/app/api/intention-spread/route.ts",
    "src/app/api/photo-reading/stream/route.ts",
    "src/lib/daily-energy.ts",
    "src/lib/natal/personalization-lens.ts",
    "src/lib/human-design/personalization-lens.ts",
  ];
  for (const file of consumers) {
    if (!readSrc(file).includes("buildMemoryContext")) {
      failures.push({ gate: "cross_product", detail: `${file} missing buildMemoryContext` });
    }
  }
  return failures;
}

export function evalBudget(): QualityFailure[] {
  const failures: QualityFailure[] = [];
  const store = storeFromMemory([
    gf("core-rel", "Клиент не в отношениях", "relationship.status", {
      captureTier: "user_confirmed",
      sourceType: "user",
      manual: true,
      critical: true,
      salience: 5,
      markers: ["не в отношениях"],
    }),
    ...Array.from({ length: 40 }, (_, i) =>
      gf(`noise-${i}`, `Клиент читала главу ${i + 1} про привычки`, "other", {
        salience: 1,
        markers: [`главу ${i + 1} про`],
      })
    ),
  ]);
  for (const depth of ["compact", "standard", "deep"] as const) {
    const { pack, block } = retrievePack(store, {
      id: `budget-${depth}`,
      query: "Какие у меня сейчас отношения и статус?",
      depth,
      mustInclude: ["core-rel"],
      mustNotInclude: [],
    });
    const budget = memoryBudgetFor(depth);
    if (block.length > budget.maxBlockChars) {
      failures.push({
        gate: "budget",
        detail: `${depth} block ${block.length} > ${budget.maxBlockChars}`,
      });
    }
    if (!block.includes("ПРАВИЛА БЕЗОПАСНОСТИ ПАМЯТИ") || !block.includes(MEMORY_SECURITY_RULES.slice(0, 24))) {
      failures.push({ gate: "budget", detail: `${depth} dropped security rules` });
    }
    const core = store.find((f) => f.id === "core-rel")!;
    if (!packFacts(pack).some((f) => f.id === core.id) && !block.includes("не в отношениях")) {
      failures.push({
        gate: "budget",
        detail: `${depth} dropped protected core fact for lower-salience noise`,
      });
    }
  }
  return failures;
}

export function evalPerformance(): {
  samples: Array<{ size: number; p50: number; p95: number; candidates: number; selected: number; chars: number }>;
} {
  const sizes = [10, 100, 300, 1000];
  const samples = sizes.map((size) => {
    const memory: GoldenFact[] = Array.from({ length: size }, (_, i) =>
      gf(`perf-${size}-${i}`, `Клиент делала заметку номер ${i + 1} о быте`, "other", {
        archiveTier: i < size * 0.8 ? "archived" : "hot",
        salience: 1,
        markers: [`заметку номер ${i + 1}`],
      })
    );
    memory.push(
      gf(`perf-${size}-needle`, "Клиент работает аналитиком в Северстали", "employment.current", {
        category: "work",
        markers: ["аналитиком в Северстали"],
        salience: 5,
      })
    );
    const store = storeFromMemory(memory);
    const times: number[] = [];
    let last = { candidates: 0, selected: 0, chars: 0 };
    for (let i = 0; i < 12; i++) {
      const { pack, block, ms } = retrievePack(store, {
        id: "perf",
        query: "Стоит ли менять работу аналитиком?",
        mustInclude: [],
        mustNotInclude: [],
      });
      times.push(ms);
      last = {
        candidates: pack.metrics.memory_candidates_count,
        selected: packFacts(pack).length,
        chars: block.length,
      };
    }
    return {
      size,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      ...last,
    };
  });
  return { samples };
}
