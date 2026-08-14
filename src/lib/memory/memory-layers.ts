import { CORE_PREDICATES } from "@/lib/memory/predicates";
import type { UserFact } from "@/lib/memory/user-facts";

export const MEMORY_LAYERS = [
  "core",
  "people",
  "current_state",
  "timeline",
  "goals",
  "events",
  "preferences",
  "episodic",
  "product",
  "other",
] as const;

export type MemoryLayer = (typeof MEMORY_LAYERS)[number];

const PEOPLE_PREDICATES = new Set([
  "relationship.partner",
  "relationship.former_partner",
  "relationship.divorce",
  "family.spouse",
  "family.child",
  "family.parent",
  "family.relative",
  "family.friend",
  "family.colleague",
]);

const CURRENT_STATE_PREDICATES = new Set([
  "employment.current",
  "employment.searching",
  "relationship.status",
  "residence.current",
  "education.current",
  "health.condition",
]);

const GOAL_PREDICATES = new Set(["goal.current"]);
const EVENT_PREDICATES = new Set(["event.upcoming"]);
const PREFERENCE_PREDICATES = new Set(["preference.stated"]);
const PRODUCT_PREDICATES = new Set(["human_design.chart", "product.discussed"]);

export function isCorePredicate(predicateKey: string | null | undefined): boolean {
  return Boolean(predicateKey && CORE_PREDICATES.has(predicateKey));
}

export function classifyMemoryLayer(fact: {
  predicateKey?: string | null;
  category?: string | null;
  status?: string | null;
  eventDate?: string | null;
  entityKey?: string | null;
  sourceType?: string | null;
}): MemoryLayer {
  const predicate = fact.predicateKey ?? "";
  if (fact.status === "superseded" || (fact.eventDate && fact.status !== "active")) {
    return "timeline";
  }
  if (PEOPLE_PREDICATES.has(predicate) || fact.entityKey?.startsWith("person:")) {
    return "people";
  }
  if (GOAL_PREDICATES.has(predicate) || fact.category === "goal") return "goals";
  if (EVENT_PREDICATES.has(predicate) || fact.category === "event") return "events";
  if (PREFERENCE_PREDICATES.has(predicate) || fact.category === "preference") {
    return "preferences";
  }
  if (PRODUCT_PREDICATES.has(predicate) || fact.sourceType === "human_design") {
    return "product";
  }
  if (CURRENT_STATE_PREDICATES.has(predicate)) return "current_state";
  if (CORE_PREDICATES.has(predicate)) return "core";
  if (fact.category === "family" || fact.category === "relationship") return "people";
  if (fact.category === "work") return "current_state";
  return "other";
}

export function isCoreIdentityFact(fact: UserFact | {
  predicateKey?: string | null;
  captureTier?: string | null;
  sourceType?: string | null;
  sourceCharacter?: string | null;
  salience?: number;
}): boolean {
  if (fact.captureTier === "user_confirmed" && isCorePredicate(fact.predicateKey)) {
    return true;
  }
  if (isCorePredicate(fact.predicateKey)) return true;
  return false;
}

export { CORE_PREDICATES, PEOPLE_PREDICATES, CURRENT_STATE_PREDICATES };
