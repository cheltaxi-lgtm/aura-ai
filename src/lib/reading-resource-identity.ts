import { createHash } from "node:crypto";

/** Hash semantic inputs, preserving card order/orientation and canonical object keys. */
export function semanticResourceFingerprint(input: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]));
    }
    return value ?? null;
  };
  return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
}

export function spreadReadingResourceKey(input: Record<string, unknown>): string {
  return `spread-resource:${semanticResourceFingerprint(input)}`;
}

/** Product anchors and consent flags in astro_meta do not change the LLM profile. */
export function readingPromptAstroMetadata(meta: unknown): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object") return null;
  const record = meta as Record<string, unknown>;
  return Object.fromEntries(["birthYear", "age", "chineseZodiac", "lifePath", "element",
    "rising_sign", "moon_sign", "dominant_planet"].map(key => [key, record[key] ?? null]));
}
