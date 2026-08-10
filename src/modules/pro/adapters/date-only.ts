/** Calendar YYYY-MM-DD from pg DATE / ISO / already-normalized strings. */
export function formatProDateOnly(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1]!;
    // Reject garbage like "Thu Jul 07" from String(Date).slice(0, 10).
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getUTCFullYear(),
      String(value.getUTCMonth() + 1).padStart(2, "0"),
      String(value.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }
  return null;
}
