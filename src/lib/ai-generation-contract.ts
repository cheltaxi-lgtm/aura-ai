import { createHash } from "node:crypto";

/** Failure codes returned when no validated AI content can be produced. */
export type AiFailureCode =
  | "llm_unavailable"
  | "empty_response"
  | "truncated"
  | "invalid_structure"
  | "validation_failed"
  | "provider_error"
  | "timeout"
  | "refused";

export type AiProvenance = {
  source: "ai";
  model: string;
  provider: string;
  attempts: number;
  finishReason: string | null;
  generatedAt: string;
  promptVersion: string;
  validatorVersion: string;
  inputFingerprint: string;
  contentHash: string;
  repaired: boolean;
  continued: boolean;
  fallbackModelUsed: boolean;
};

export type AiGenerationSuccess = {
  ok: true;
  source: "ai";
  content: string;
  provenance: AiProvenance;
};

export type AiGenerationFailure = {
  ok: false;
  code: AiFailureCode;
  retryable: boolean;
  detail?: string;
};

export type AiGenerationOutcome = AiGenerationSuccess | AiGenerationFailure;

export const AI_PROMPT_VERSION = "v1";
export const AI_VALIDATOR_VERSION = "v1";

export function hashAiContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function fingerprintAiInput(parts: unknown[]): string {
  return createHash("sha256")
    .update(JSON.stringify(parts), "utf8")
    .digest("hex")
    .slice(0, 32);
}

export function toAiFailure(
  code: AiFailureCode,
  options?: { retryable?: boolean; detail?: string }
): AiGenerationFailure {
  return {
    ok: false,
    code,
    retryable: options?.retryable ?? code !== "refused",
    detail: options?.detail,
  };
}

export function assertAiSuccess(
  outcome: AiGenerationOutcome
): asserts outcome is AiGenerationSuccess {
  if (!outcome.ok || outcome.source !== "ai") {
    throw new Error(
      outcome.ok
        ? "AI generation outcome missing ai source"
        : `AI generation failed: ${outcome.code}`
    );
  }
}

/** Cache reuse is allowed only for previously validated AI content. */
export function isAiCacheReusable(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  const record = meta as Record<string, unknown>;
  if (record.source !== "ai") return false;
  const provenance = record.provenance;
  if (!provenance || typeof provenance !== "object") return false;
  const p = provenance as Record<string, unknown>;
  return (
    p.source === "ai" &&
    typeof p.model === "string" &&
    p.model.length > 0 &&
    typeof p.contentHash === "string" &&
    p.contentHash.length > 0
  );
}

export function buildAiProvenance(input: {
  model: string;
  provider?: string;
  attempts: number;
  finishReason: string | null;
  promptVersion?: string;
  validatorVersion?: string;
  inputFingerprint: string;
  content: string;
  repaired?: boolean;
  continued?: boolean;
  fallbackModelUsed?: boolean;
}): AiProvenance {
  return {
    source: "ai",
    model: input.model,
    provider: input.provider ?? "openrouter",
    attempts: input.attempts,
    finishReason: input.finishReason,
    generatedAt: new Date().toISOString(),
    promptVersion: input.promptVersion ?? AI_PROMPT_VERSION,
    validatorVersion: input.validatorVersion ?? AI_VALIDATOR_VERSION,
    inputFingerprint: input.inputFingerprint,
    contentHash: hashAiContent(input.content),
    repaired: Boolean(input.repaired),
    continued: Boolean(input.continued),
    fallbackModelUsed: Boolean(input.fallbackModelUsed),
  };
}
