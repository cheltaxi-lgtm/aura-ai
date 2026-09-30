import { safeLandingPath, type UtmAttribution } from "@/lib/utm/attribution";

const ATTR_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "yclid",
  "ysclid",
  "gclid",
  "fbclid",
  "landingPath",
  "capturedAt",
] as const;

/** Sanitize client-sent first-touch attribution for DB storage. */
export function sanitizeRegistrationAttribution(
  raw: unknown
): UtmAttribution | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: UtmAttribution = {};
  for (const key of ATTR_KEYS) {
    const value = src[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const max = key === "capturedAt" ? 40 : 200;
    const safeValue = key === "landingPath" ? safeLandingPath(trimmed) : trimmed.slice(0, max);
    if (safeValue) (out as Record<string, string>)[key] = safeValue;
  }
  return Object.keys(out).some((k) => k.startsWith("utm_") || k.endsWith("clid")) || out.landingPath
    ? out
    : null;
}

/** Parse attribution from OAuth start query (`attribution` JSON string). */
export function parseAttributionQueryParam(raw: string | null | undefined): UtmAttribution | null {
  if (!raw?.trim()) return null;
  try {
    return sanitizeRegistrationAttribution(JSON.parse(raw));
  } catch {
    try {
      return sanitizeRegistrationAttribution(JSON.parse(decodeURIComponent(raw)));
    } catch {
      return null;
    }
  }
}

export function attributionToJson(
  attribution: UtmAttribution | null | undefined
): string | null {
  if (!attribution) return null;
  return JSON.stringify(attribution);
}
