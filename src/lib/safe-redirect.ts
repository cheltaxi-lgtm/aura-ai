/** Allow only same-origin relative paths for post-auth redirects. */

function isSafeRelativePath(path: string, origin: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("\\") || /%5c/i.test(path)) return false;
  if (path.includes("://")) return false;
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  try {
    const resolved = new URL(path, origin.endsWith("/") ? origin : `${origin}/`);
    const expected = new URL(origin.endsWith("/") ? origin : `${origin}/`);
    return resolved.origin === expected.origin;
  } catch {
    return false;
  }
}

/**
 * Sanitize post-auth return paths. Rejects protocol-relative URLs, backslash
 * open-redirects (`/\\evil.com`), and any path that resolves off-origin.
 */
export function sanitizeReturnTo(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "https://zovus.ru").replace(/\/$/, "");
  if (!isSafeRelativePath(trimmed, origin)) return fallback;
  return trimmed;
}

/** Same checks with an explicit origin (session-bridge / OAuth). */
export function sanitizeReturnToWithOrigin(
  raw: string | null | undefined,
  origin: string,
  fallback = "/"
): string {
  if (!raw || typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!isSafeRelativePath(trimmed, origin.replace(/\/$/, ""))) return fallback;
  return trimmed;
}
