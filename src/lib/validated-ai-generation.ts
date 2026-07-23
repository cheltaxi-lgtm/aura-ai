import {
  buildAiProvenance,
  fingerprintAiInput,
  toAiFailure,
  type AiFailureCode,
  type AiGenerationOutcome,
} from "@/lib/ai-generation-contract";
import { getAdminAiSettings, getChatModel, getNatalModel } from "@/lib/ai-model";
import {
  completeChatDetailed,
  isOpenRouterConfigured,
  type ChatMessage,
  type CompleteChatOptions,
} from "@/lib/llm";

export type ValidatedAiGenerateOptions = {
  messages: ChatMessage[];
  /** Stable parts that identify this generation input. */
  inputParts: unknown[];
  validate: (text: string) => { ok: true } | { ok: false; code: AiFailureCode; detail?: string };
  /** Optional repair prompt builder. Called once after a structural/validation failure. */
  buildRepairMessages?: (failedText: string, detail?: string) => ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  jsonObject?: boolean;
  allowReasoningFallback?: boolean;
  /** Use natal primary + natalFallbackModels instead of chat models. */
  modelFamily?: "chat" | "natal";
  promptVersion?: string;
  validatorVersion?: string;
  /** Extra CompleteChatOptions passthrough. */
  chatOptions?: Omit<
    CompleteChatOptions,
    "messages" | "maxTokens" | "temperature" | "timeoutMs" | "jsonObject" | "modelOverride" | "allowReasoningFallback"
  >;
};

function uniqueModels(models: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  for (const raw of models) {
    const model = raw?.trim();
    if (!model) continue;
    if (!out.includes(model)) out.push(model);
  }
  return out;
}

async function resolveModelChain(family: "chat" | "natal"): Promise<string[]> {
  const ai = await getAdminAiSettings();
  if (family === "natal") {
    const primary = await getNatalModel();
    return uniqueModels([primary, ...(ai.natalFallbackModels ?? [])]);
  }
  const primary = await getChatModel();
  return uniqueModels([primary, ...(ai.fallbackModels ?? [])]);
}

function looksTruncated(text: string, finishReason: string | null): boolean {
  if (finishReason === "length") return true;
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Incomplete trailing markdown/sentence markers are soft signals only with length finish.
  return false;
}

/**
 * Multi-attempt AI generation with transport retries (inside completeChatDetailed),
 * one AI-repair pass, and optional admin-configured backup models.
 * Never invents template text — returns ok:false when AI content is unavailable.
 */
export async function generateValidatedAiText(
  options: ValidatedAiGenerateOptions
): Promise<AiGenerationOutcome> {
  if (!isOpenRouterConfigured()) {
    return toAiFailure("llm_unavailable", { retryable: true, detail: "openrouter_not_configured" });
  }

  const models = await resolveModelChain(options.modelFamily ?? "chat");
  if (!models.length) {
    return toAiFailure("llm_unavailable", { retryable: true, detail: "no_model_configured" });
  }

  const inputFingerprint = fingerprintAiInput(options.inputParts);
  let attempts = 0;
  let repaired = false;
  let continued = false;
  let lastCode: AiFailureCode = "empty_response";
  let lastDetail: string | undefined;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex]!;
    const isFallbackModel = modelIndex > 0;

    const runOnce = async (messages: ChatMessage[]) => {
      attempts += 1;
      return completeChatDetailed({
        ...options.chatOptions,
        messages,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        timeoutMs: options.timeoutMs,
        jsonObject: options.jsonObject,
        allowReasoningFallback: options.allowReasoningFallback,
        modelOverride: model,
        // Transport retries stay inside llm.ts; keep one temp retry unless disabled.
      });
    };

    let result = await runOnce(options.messages);

    if (!result.text?.trim()) {
      lastCode = result.finishReason === "length" ? "truncated" : "empty_response";
      lastDetail = `model=${model};finish=${result.finishReason ?? "null"}`;
      continue;
    }

    if (looksTruncated(result.text, result.finishReason) || result.finishReason === "length") {
      continued = true;
      const partial = result.text;
      const continuation = await runOnce([
        ...options.messages,
        { role: "assistant", content: partial },
        {
          role: "user",
          content:
            "Продолжи ответ с того места, где оборвался. Не начинай заново и не повторяй уже сказанное.",
        },
      ]);
      if (continuation.text?.trim()) {
        result = {
          text: `${partial}${continuation.text}`,
          finishReason: continuation.finishReason,
        };
      } else {
        lastCode = "truncated";
        lastDetail = `model=${model};finish=${result.finishReason ?? "null"}`;
        // Keep partial and let validator decide.
      }
    }

    const candidateText = result.text;
    if (!candidateText?.trim()) {
      lastCode = "empty_response";
      lastDetail = `model=${model}`;
      continue;
    }

    let validation = options.validate(candidateText);
    if (!validation.ok && options.buildRepairMessages && !repaired) {
      repaired = true;
      const repairMessages = options.buildRepairMessages(candidateText, validation.detail);
      const repairedResult = await runOnce(repairMessages);
      if (repairedResult.text?.trim()) {
        result = repairedResult;
        const repairedText = result.text;
        if (repairedText?.trim()) {
          validation = options.validate(repairedText);
        }
      }
    }

    if (!validation.ok) {
      lastCode = validation.code;
      lastDetail = validation.detail ?? `model=${model}`;
      continue;
    }

    const content = (result.text ?? candidateText).trim();
    return {
      ok: true,
      source: "ai",
      content,
      provenance: buildAiProvenance({
        model,
        attempts,
        finishReason: result.finishReason,
        promptVersion: options.promptVersion,
        validatorVersion: options.validatorVersion,
        inputFingerprint,
        content,
        repaired,
        continued,
        fallbackModelUsed: isFallbackModel,
      }),
    };
  }

  return toAiFailure(lastCode, { retryable: true, detail: lastDetail });
}
