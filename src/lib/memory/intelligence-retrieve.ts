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

export function serializeIntelligenceXml(
  snapshots: CurrentStateSnapshot[],
  episodes: MemoryEpisode[],
  selectedFacts: UserFact[]
): string {
  const selected = factById(selectedFacts);
  const emitted = new Set<string>();
  const blocks: string[] = [];

  for (const snapshot of snapshots) {
    const slots: string[] = [];
    const state = snapshot.state;
    const pushSlot = (name: string, id: unknown) => {
      if (typeof id !== "string" || !selected.has(id) || emitted.has(`snap:${id}`)) return;
      const fact = selected.get(id)!;
      const fresh = assessFactFreshness(fact);
      slots.push(
        `  <slot name="${escapeMemoryXml(name)}" fact_id="${escapeMemoryXml(id)}" freshness="${fresh.label}" usage="${fresh.usageMode}"/>`
      );
      emitted.add(`snap:${id}`);
    };
    pushSlot("current", state.current);
    pushSlot("searching", state.searching);
    pushSlot("status", state.status);
    pushSlot("partner", state.partner);
    pushSlot("spouse", state.spouse);
    if (Array.isArray(state.goals)) state.goals.forEach((id) => pushSlot("goal", id));
    if (Array.isArray(state.children)) state.children.forEach((id) => pushSlot("child", id));
    if (Array.isArray(state.former)) state.former.forEach((id) => pushSlot("former", id));
    if (Array.isArray(state.divorce)) state.divorce.forEach((id) => pushSlot("divorce", id));
    if (Array.isArray(state.debts)) state.debts.forEach((id) => pushSlot("debt", id));
    if (Array.isArray(state.conditions)) state.conditions.forEach((id) => pushSlot("condition", id));
    if (!slots.length) continue;
    blocks.push(
      `<current_state domain="${escapeMemoryXml(snapshot.domain)}">\n${slots.join("\n")}\n</current_state>`
    );
  }

  for (const episode of episodes) {
    const refs = episode.supportingFactIds
      .filter((id) => selected.has(id) && !emitted.has(`ep:${id}`))
      .map((id) => {
        const fact = selected.get(id)!;
        const fresh = assessFactFreshness(fact);
        emitted.add(`ep:${id}`);
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

export function countStaleSelectedFacts(facts: UserFact[]): number {
  return facts.filter((fact) => assessFactFreshness(fact).isStale).length;
}

export function isKnownSnapshotDomain(value: string): value is MemorySnapshotDomain {
  return (MEMORY_SNAPSHOT_DOMAINS as readonly string[]).includes(value);
}
