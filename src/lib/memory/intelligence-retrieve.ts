/**
 * Deterministic planner + prompt serialization for derived intelligence.
 * Never overrides raw V3 layers. Fail-closed to empty.
 */
import { escapeMemoryXml } from "@/lib/memory/injection-guard";
import { assessFactFreshness, isMemoryIntelligenceEnabled } from "@/lib/memory/freshness";
import { loadCurrentStateSnapshots } from "@/lib/memory/current-state";
import { loadEpisodes } from "@/lib/memory/episodes";
import {
  MEMORY_SNAPSHOT_DOMAINS,
  type CurrentStateSnapshot,
  type MemoryEpisode,
  type MemoryEpisodeDomain,
  type MemorySnapshotDomain,
} from "@/lib/memory/intelligence-types";
import { matchedMemoryTopics, type ExpandedMemoryQuery } from "@/lib/memory/query-expansion";
import type { UserFact } from "@/lib/memory/user-facts";

const TOPIC_TO_DOMAIN: Record<string, MemorySnapshotDomain | null> = {
  work: "work",
  relationship: "relationship",
  family: "family",
  money: "money",
  health: "health",
  residence: "residence",
  education: "education",
  goals: "goals",
  preferences: null,
  general: null,
};

export type MemoryIntelligencePlan = {
  domains: MemorySnapshotDomain[];
  episodeDomains: MemoryEpisodeDomain[];
  entityKeys: string[];
};

export function planMemoryIntelligence(
  expansion: ExpandedMemoryQuery
): MemoryIntelligencePlan {
  const domains = new Set<MemorySnapshotDomain>();
  for (const rule of matchedMemoryTopics(expansion.original)) {
    const domain = TOPIC_TO_DOMAIN[rule.topic];
    if (domain) domains.add(domain);
  }
  const detected = TOPIC_TO_DOMAIN[expansion.topic];
  if (detected) domains.add(detected);
  if (expansion.entityKeys.length) {
    domains.add("relationship");
  }
  if (/поездк|отпуск|билет|командир/i.test(expansion.original)) {
    /* event episodes only — not a snapshot domain */
  }
  const list = [...domains];
  const episodeDomains: MemoryEpisodeDomain[] = [...list];
  if (/поездк|отпуск|билет|командир/i.test(expansion.original)) {
    episodeDomains.push("event");
  }
  return {
    domains: list,
    episodeDomains,
    entityKeys: expansion.entityKeys,
  };
}

export async function loadMemoryIntelligenceForPack(
  userId: string,
  expansion: ExpandedMemoryQuery
): Promise<{
  snapshots: CurrentStateSnapshot[];
  episodes: MemoryEpisode[];
  episodeCandidates: number;
} | null> {
  if (!userId || !isMemoryIntelligenceEnabled()) {
    return { snapshots: [], episodes: [], episodeCandidates: 0 };
  }
  try {
    const plan = planMemoryIntelligence(expansion);
    if (!plan.domains.length && !plan.episodeDomains.length) {
      return { snapshots: [], episodes: [], episodeCandidates: 0 };
    }
    const [snapshots, episodes] = await Promise.all([
      plan.domains.length
        ? loadCurrentStateSnapshots(userId, plan.domains)
        : Promise.resolve([]),
      plan.episodeDomains.length
        ? loadEpisodes(userId, { domains: plan.episodeDomains })
        : Promise.resolve([]),
    ]);
    const filteredEpisodes = plan.entityKeys.length
      ? episodes.filter(
          (episode) => episode.entityKey && plan.entityKeys.includes(episode.entityKey)
        )
      : episodes;
    return {
      snapshots,
      episodes: filteredEpisodes,
      episodeCandidates: episodes.length,
    };
  } catch {
    return null;
  }
}

function factById(facts: UserFact[]): Map<string, UserFact> {
  return new Map(facts.map((fact) => [fact.id, fact]));
}

const SNAPSHOT_SLOT_FIELDS: Record<string, string[]> = {
  work: ["current", "searching", "former", "goals"],
  relationship: ["status", "partner", "former", "divorce"],
  family: ["children", "parents", "relatives", "spouse"],
  health: ["conditions", "procedures"],
  goals: ["current"],
  residence: ["current", "former"],
  education: ["current", "former"],
  money: ["debts"],
};

export function serializeIntelligenceXml(
  snapshots: CurrentStateSnapshot[],
  episodes: MemoryEpisode[],
  selectedFacts: UserFact[],
  now = new Date()
): string {
  const selected = factById(selectedFacts);
  const emitted = new Set<string>();
  const blocks: string[] = [];

  for (const snapshot of snapshots) {
    const slots: string[] = [];
    const state = snapshot.state;
    const pushSlot = (name: string, id: unknown) => {
      if (typeof id !== "string" || !selected.has(id) || emitted.has(id)) return;
      const fact = selected.get(id)!;
      const fresh = assessFactFreshness(fact, now);
      slots.push(
        `  <slot name="${escapeMemoryXml(name)}" fact_id="${escapeMemoryXml(id)}" freshness="${fresh.label}" usage="${fresh.usageMode}"/>`
      );
      emitted.add(id);
    };
    const pushValue = (name: string, value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach((id) => pushSlot(name, id));
        return;
      }
      pushSlot(name, value);
    };
    const fields = SNAPSHOT_SLOT_FIELDS[snapshot.domain] ?? [
      "current",
      "searching",
      "status",
      "partner",
      "spouse",
    ];
    for (const field of fields) {
      pushValue(field, state[field]);
    }
    if (!slots.length) continue;
    blocks.push(
      `<current_state domain="${escapeMemoryXml(snapshot.domain)}">\n${slots.join("\n")}\n</current_state>`
    );
  }

  for (const episode of episodes) {
    const refs = episode.supportingFactIds
      .filter((id) => selected.has(id) && !emitted.has(id))
      .map((id) => {
        const fact = selected.get(id)!;
        const fresh = assessFactFreshness(fact, now);
        emitted.add(id);
        return `  <fact_ref id="${escapeMemoryXml(id)}" predicate="${escapeMemoryXml(fact.predicateKey ?? "")}" status="${escapeMemoryXml(fact.status ?? "active")}" freshness="${fresh.label}"/>`;
      });
    if (!refs.length) continue;
    const entity = episode.entityKey
      ? ` entity="${escapeMemoryXml(episode.entityKey)}"`
      : "";
    blocks.push(
      `<episode domain="${escapeMemoryXml(episode.domain)}" status="${escapeMemoryXml(episode.status)}"${entity}>\n${refs.join("\n")}\n</episode>`
    );
  }

  return blocks.join("\n\n");
}

export function countStaleSelectedFacts(facts: UserFact[], now = new Date()): number {
  return facts.filter((fact) => assessFactFreshness(fact, now).isStale).length;
}

export function isKnownSnapshotDomain(value: string): value is MemorySnapshotDomain {
  return (MEMORY_SNAPSHOT_DOMAINS as readonly string[]).includes(value);
}
