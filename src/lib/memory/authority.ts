/**
 * Memory authority hierarchy. Lower ranks never automatically rewrite higher.
 *
 * 1. user-authored
 * 2. user-confirmed
 * 3. high-confidence extracted
 * 4. draft / inferred
 */

export type MemoryAuthorityRank = 1 | 2 | 3 | 4;

export type MemoryAuthorityInput = {
  sourceType?: string | null;
  sourceCharacter?: string | null;
  captureTier?: string | null;
  confidence?: number | null;
};

export function isUserAuthored(input: MemoryAuthorityInput): boolean {
  return input.sourceType === "user" || input.sourceCharacter === "user";
}

export function isProtectedFact(input: MemoryAuthorityInput): boolean {
  return (
    input.sourceType === "user" ||
    input.sourceCharacter === "user" ||
    input.captureTier === "user_confirmed"
  );
}

export function memoryAuthorityRank(input: MemoryAuthorityInput): MemoryAuthorityRank {
  if (isUserAuthored(input)) return 1;
  if (input.captureTier === "user_confirmed") return 2;
  if ((input.confidence ?? 1) >= 0.85 && input.captureTier !== "draft") return 3;
  return 4;
}

/** Incoming may mutate existing only when its authority is equal or higher. */
export function canMutateExistingFact(
  existing: MemoryAuthorityInput,
  incoming: MemoryAuthorityInput
): boolean {
  if (isProtectedFact(existing) && !isUserAuthored(incoming)) return false;
  return memoryAuthorityRank(incoming) <= memoryAuthorityRank(existing);
}

/** Auto extraction may supersede a singleton only when the existing row is not protected. */
export function canAutoSupersede(existing: MemoryAuthorityInput, incoming: MemoryAuthorityInput): boolean {
  if (isProtectedFact(existing) && !isUserAuthored(incoming)) return false;
  return canMutateExistingFact(existing, incoming);
}
