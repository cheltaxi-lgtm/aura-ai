import { createHash } from "node:crypto";

/** Light normalize for dedupe keys (not the safety normalizer). */
export function normalizeQuestionForHash(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function hashQuestion(raw: string): string {
  return createHash("sha256").update(normalizeQuestionForHash(raw), "utf8").digest("hex");
}
