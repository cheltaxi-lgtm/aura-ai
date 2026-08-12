/**
 * Estimated AI spend per Pro report, in RUB.
 *
 * Generators do not propagate token usage from deep sectional calls, so we
 * estimate from output volume: completion tokens from block text, prompt
 * tokens from a fixed evidence base + re-read multiplier. Priced against the
 * live OpenRouter catalog (falls back to static rates when unreachable).
 * Marked as an estimate everywhere it is shown.
 */

import { resolveCostRubFromUsage } from "@/lib/hd-report-pipeline/cost";
import { getNatalModel } from "@/lib/ai-model";
import type { ProReportBlock } from "../domain/types";

/** Russian prose ≈ 3.5 chars/token; evidence+system prompts ≈ 6k tokens base. */
const PROMPT_BASE_TOKENS = 6000;
const PROMPT_REREAD_MULTIPLIER = 2;

export async function estimateProReportCostRub(
  blocks: ProReportBlock[]
): Promise<number> {
  const chars = blocks.reduce(
    (n, b) => n + (b.body?.length ?? 0) + (b.practice?.length ?? 0),
    0
  );
  const completionTokens = Math.max(1, Math.ceil(chars / 3.5));
  const promptTokens =
    PROMPT_BASE_TOKENS + completionTokens * PROMPT_REREAD_MULTIPLIER;
  const model = await getNatalModel();
  const { rub } = await resolveCostRubFromUsage(
    { promptTokens, completionTokens },
    model
  );
  return rub;
}

/** Single-block refine ≈ one section out + the section re-read as input. */
export async function estimateProRefineCostRub(
  block: ProReportBlock
): Promise<number> {
  const chars = (block.body?.length ?? 0) + (block.practice?.length ?? 0);
  const completionTokens = Math.max(1, Math.ceil(chars / 3.5));
  const promptTokens = 1500 + completionTokens;
  const model = await getNatalModel();
  const { rub } = await resolveCostRubFromUsage(
    { promptTokens, completionTokens },
    model
  );
  return rub;
}
