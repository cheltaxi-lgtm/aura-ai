import { getModelUsdPerToken, usdToRubRate } from "@/lib/openrouter-pricing";
import { expectedHdSectionalLlmCalls } from "./sections";

/**
 * Offline fallback only — live rates come from the OpenRouter catalog via
 * resolveCostRubFromUsage. Used when the catalog is unreachable.
 */
export const HD_MODEL_RUB_PER_1K: Record<
  string,
  { input: number; output: number }
> = {
  // DeepSeek V3 on OpenRouter ≈ $0.27/M in, $1.10/M out → ~₽25/$ → rough RUB/1k
  "deepseek/deepseek-chat-v3-0324": { input: 0.007, output: 0.028 },
  "moonshotai/kimi-k2.5": { input: 0.015, output: 0.06 },
};

export type HdTokenUsage = {
  promptTokens: number;
  completionTokens: number;
};

export function estimateCostRubFromUsage(
  usage: HdTokenUsage,
  modelId: string
): number {
  const rates =
    HD_MODEL_RUB_PER_1K[modelId] ??
    HD_MODEL_RUB_PER_1K["deepseek/deepseek-chat-v3-0324"]!;
  const rub =
    (usage.promptTokens / 1000) * rates.input +
    (usage.completionTokens / 1000) * rates.output;
  return Math.round(rub * 100) / 100;
}

export type HdCostBreakdown = {
  rub: number;
  /** Where the rates came from — "static" means the catalog was unreachable. */
  source: "openrouter" | "static";
};

/**
 * Cost for any model, priced from the live OpenRouter catalog so a model switch
 * in the admin picker does not silently bill at DeepSeek rates.
 */
export async function resolveCostRubFromUsage(
  usage: HdTokenUsage,
  modelId: string
): Promise<HdCostBreakdown> {
  const live = await getModelUsdPerToken(modelId);
  if (live) {
    const usd =
      usage.promptTokens * live.input + usage.completionTokens * live.output;
    return {
      rub: Math.round(usd * usdToRubRate() * 100) / 100,
      source: "openrouter",
    };
  }
  return { rub: estimateCostRubFromUsage(usage, modelId), source: "static" };
}

/** Legacy estimate when usage is unavailable. */
export function estimateHdSectionalReportCostRub(opts?: {
  paidModelId?: string;
  rubPer1kTokens?: number;
}): {
  llmCalls: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedRub: number;
  modelNote: string;
} {
  const llmCalls = expectedHdSectionalLlmCalls();
  const batchCalls = llmCalls - 1;
  const estimatedInputTokens = batchCalls * 3500 + 10_000;
  const estimatedOutputTokens = batchCalls * 1800 + 6000;
  const modelId =
    opts?.paidModelId || "deepseek/deepseek-chat-v3-0324";
  const estimatedRub = estimateCostRubFromUsage(
    {
      promptTokens: estimatedInputTokens,
      completionTokens: estimatedOutputTokens,
    },
    modelId
  );
  return {
    llmCalls,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedRub,
    modelNote: modelId,
  };
}
