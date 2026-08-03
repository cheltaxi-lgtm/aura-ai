/** Prune expired sliding-window rate-limit map entries to avoid unbounded growth. */
export function pruneRateMap(
  map: Map<string | number, { reset: number } | { resetAt: number }>,
  now = Date.now()
): number {
  let removed = 0;
  for (const [key, slot] of map) {
    const reset = "reset" in slot ? slot.reset : slot.resetAt;
    if (reset < now) {
      map.delete(key);
      removed += 1;
    }
  }
  return removed;
}
