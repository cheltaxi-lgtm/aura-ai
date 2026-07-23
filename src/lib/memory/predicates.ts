/** Replaceable vs multi-value predicates for contradiction lifecycle. */

export const REPLACE_PREDICATES = new Set([
  "employment.current",
  "employment.searching",
  "relationship.status",
  "relationship.partner",
  "residence.current",
  "education.current",
  "goal.current",
]);

export const MULTI_PREDICATES = new Set([
  "family.child",
  "family.spouse",
  "health.condition",
  "health.procedure",
  "finance.debt",
  "event.upcoming",
]);

export const SENSITIVE_PREDICATES = new Set([
  "health.condition",
  "health.procedure",
  "finance.debt",
]);

export const SENSITIVE_CATEGORIES = new Set(["health", "money"]);

export function isReplacePredicate(predicateKey: string | null | undefined): boolean {
  return Boolean(predicateKey && REPLACE_PREDICATES.has(predicateKey));
}

/** Predicates that mutually supersede (contradictory singleton states). */
export function supersedeGroupForPredicate(
  predicateKey: string | null | undefined
): string[] {
  if (!predicateKey) return [];
  if (
    predicateKey === "employment.current" ||
    predicateKey === "employment.searching"
  ) {
    return ["employment.current", "employment.searching"];
  }
  if (isReplacePredicate(predicateKey)) return [predicateKey];
  return [];
}

export function isSensitiveFact(input: {
  predicateKey?: string | null;
  category?: string | null;
  sensitivity?: string | null;
}): boolean {
  if (input.sensitivity === "sensitive") return true;
  if (input.predicateKey && SENSITIVE_PREDICATES.has(input.predicateKey)) return true;
  if (input.category && SENSITIVE_CATEGORIES.has(input.category)) return true;
  return false;
}
