/** Allow only same-origin relative paths for post-auth redirects. */
export function sanitizeReturnTo(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  return trimmed;
}
