/**
 * Shared types for Memory Intelligence P1 (derived layers only).
 * Raw user_facts remain the source of truth.
 */

export const MEMORY_INTELLIGENCE_ALGORITHM_VERSION = "p1.2";

export const MEMORY_SNAPSHOT_DOMAINS = [
  "relationship",
  "family",
  "work",
  "money",
  "health",
  "residence",
  "education",
  "goals",
] as const;

export type MemorySnapshotDomain = (typeof MEMORY_SNAPSHOT_DOMAINS)[number];

export const MEMORY_EPISODE_DOMAINS = [
  ...MEMORY_SNAPSHOT_DOMAINS,
  "event",
] as const;

export type MemoryEpisodeDomain = (typeof MEMORY_EPISODE_DOMAINS)[number];

export type MemoryEpisodeStatus = "active" | "historical";

export type CurrentStateSnapshot = {
  domain: MemorySnapshotDomain;
  state: Record<string, unknown>;
  supportingFactIds: string[];
  primaryFactIds: string[];
  entityKeys: string[];
  computedAt: string;
  algorithmVersion: string;
};

export type MemoryEpisode = {
  id?: string;
  domain: MemoryEpisodeDomain;
  entityKey: string | null;
  startAt: string | null;
  endAt: string | null;
  status: MemoryEpisodeStatus;
  supportingFactIds: string[];
  episodeKey: string;
  computedAt: string;
  algorithmVersion: string;
};

const PRODUCT_OR_PREDICTION_PREFIXES = ["human_design.", "product."];

export function isIntelligenceEligibleFact(fact: {
  status?: string | null;
  predicateKey?: string | null;
  sourceType?: string | null;
}): boolean {
  const status = fact.status ?? "active";
  if (status === "draft" || status === "forgotten") return false;
  const predicate = fact.predicateKey ?? "";
  if (PRODUCT_OR_PREDICTION_PREFIXES.some((prefix) => predicate.startsWith(prefix))) {
    return false;
  }
  if (fact.sourceType === "human_design") return false;
  return true;
}

export function domainForFact(fact: {
  predicateKey?: string | null;
  category?: string | null;
}): MemoryEpisodeDomain | null {
  const predicate = fact.predicateKey ?? "";
  const category = fact.category ?? "";
  if (predicate.startsWith("employment.")) return "work";
  if (predicate.startsWith("relationship.")) return "relationship";
  if (predicate.startsWith("family.")) return "family";
  if (predicate.startsWith("finance.")) return "money";
  if (predicate.startsWith("health.")) return "health";
  if (predicate.startsWith("residence.")) return "residence";
  if (predicate.startsWith("education.")) return "education";
  if (predicate.startsWith("goal.")) return "goals";
  if (predicate === "event.upcoming" || predicate.startsWith("event.")) {
    if (category === "work") return "work";
    if (category === "relationship") return "relationship";
    if (category === "family") return "family";
    if (category === "health") return "health";
    if (category === "money") return "money";
    if (category === "residence") return "residence";
    if (category === "education") return "education";
    return "event";
  }
  if (category === "work") return "work";
  if (category === "relationship") return "relationship";
  if (category === "family") return "family";
  if (category === "health") return "health";
  if (category === "money") return "money";
  if (category === "residence") return "residence";
  if (category === "education") return "education";
  if (category === "goal") return "goals";
  if (category === "event") return "event";
  return null;
}
