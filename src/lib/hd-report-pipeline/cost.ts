import { getModelUsdPerToken, usdToRubRate } from "@/lib/openrouter-pricing";
import { expectedHdSectionalLlmCalls } from "./sections";

export type HdTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  /** False when any actual provider call omitted complete token usage. */
  complete?: boolean;
};

export function estimateCostRubFromUsage(
  usage: HdTokenUsage,
  _modelId: string
): number | null {
  if (usage.complete === false) return null;
  // An unavailable price is not zero and cannot be guessed from another model.
  return usage.promptTokens === 0 && usage.completionTokens === 0 ? 0 : null;
}

export type HdCostBreakdown = {
  rub: number | null;
  source: "openrouter" | "unavailable";
};

/**
 * Cost for any model, priced from the live OpenRouter catalog so a model switch
 * in the admin picker does not silently bill at DeepSeek rates.
 */
export async function resolveCostRubFromUsage(
  usage: HdTokenUsage,
  modelId: string
): Promise<HdCostBreakdown> {
  if (usage.complete === false) return {rub:null,source:"unavailable"};
  const live = await getModelUsdPerToken(modelId);
  if (live) {
    const usd =
      usage.promptTokens * live.input + usage.completionTokens * live.output;
    return {
      rub: Math.round(usd * usdToRubRate() * 100) / 100,
      source: "openrouter",
    };
  }
  return { rub: estimateCostRubFromUsage(usage, modelId), source: "unavailable" };
}

/** Legacy estimate when usage is unavailable. */
export function estimateHdSectionalReportCostRub(opts?: {
  paidModelId?: string;
  rubPer1kTokens?: number;
}): {
  llmCalls: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedRub: number | null;
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
