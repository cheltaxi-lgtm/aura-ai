/** Minimum time the spread-reading ritual stays visible (avoids a flash). */
export const MIN_SPREAD_RITUAL_MS = 2_500;

export async function ensureMinSpreadRitualDisplay(startedAtMs: number): Promise<void> {
  const remaining = MIN_SPREAD_RITUAL_MS - (Date.now() - startedAtMs);
  if (remaining > 0) {
    await new Promise((r) => setTimeout(r, remaining));
  }
}
