const IDEM_KEY_MAX = 128;
const IDEM_KEY_RE = /^[A-Za-z0-9_.:\-]+$/;

/** Invalid caller keys are absent; never write their contents to diagnostics. */
export function normalizeChargeIdempotencyKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > IDEM_KEY_MAX || !IDEM_KEY_RE.test(trimmed)) {
    console.warn("[billing] invalid idempotencyKey ignored", { length: trimmed.length });
    return null;
  }
  return trimmed;
}
