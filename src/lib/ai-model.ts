import { getSetting, type AiSettings } from "@/lib/settings";

/** AI settings from admin panel (platform_settings key = 'ai'). */
export async function getAdminAiSettings(): Promise<AiSettings> {
  return getSetting("ai");
}

/**
 * Which admin model field to use for text chat/readings.
 * - paid: paidModel → model
 * - free: freeModel → paidModel → model
 * - default: model (legacy fallback / shared field)
 */
export type ChatModelTier = "default" | "paid" | "free";

/** Primary chat/text model — from admin settings (tier selects paid/free/default field). */
export async function getChatModel(tier: ChatModelTier = "default"): Promise<string> {
  const ai = await getAdminAiSettings();
  if (tier === "paid") {
    return ai.paidModel?.trim() || ai.model;
  }
  if (tier === "free") {
    return ai.freeModel?.trim() || ai.paidModel?.trim() || ai.model;
  }
  return ai.model;
}

/** Vision model — from admin settings. */
export async function getVisionModel(): Promise<string> {
  const ai = await getAdminAiSettings();
  return ai.visionModel;
}

/** Natal reports, forecasts, synastry — fast non-reasoning model with JSON output. */
export async function getNatalModel(): Promise<string> {
  const ai = await getAdminAiSettings();
  const natal = ai.natalModel?.trim();
  if (natal) return natal;
  return ai.model;
}

/**
 * Default when admin left matrixModel empty.
 * Prefer a non-heavy-reasoning chat model: Gemini 3.x burns zone budgets on reasoning_tokens.
 */
export const DEFAULT_MATRIX_MODEL = "deepseek/deepseek-chat-v3-0324";

/**
 * Destiny matrix zone assembly.
 * matrixModel → DEFAULT_MATRIX_MODEL → paidModel → model.
 */
export async function getMatrixModel(): Promise<string> {
  const ai = await getAdminAiSettings();
  return (
    ai.matrixModel?.trim() ||
    DEFAULT_MATRIX_MODEL ||
    ai.paidModel?.trim() ||
    ai.model
  );
}

/**
 * Human Design report/insight model.
 * hdModel → paidModel → model. Sectional pipeline quality gate fails on thin
 * output (DeepSeek v3 writes ~3–7k chars vs required long-form) — kimi-k2.5 passes.
 */
export async function getHdModel(): Promise<string> {
  const ai = await getAdminAiSettings();
  return ai.hdModel?.trim() || ai.paidModel?.trim() || ai.model;
}

/** Ordered chat/reading backup models from admin settings (may be empty). */
export async function getChatFallbackModels(): Promise<string[]> {
  const ai = await getAdminAiSettings();
  return (ai.fallbackModels ?? []).map((m) => m.trim()).filter(Boolean);
}

/** Ordered natal backup models from admin settings (may be empty). */
export async function getNatalFallbackModels(): Promise<string[]> {
  const ai = await getAdminAiSettings();
  return (ai.natalFallbackModels ?? []).map((m) => m.trim()).filter(Boolean);
}

/**
 * Matrix zone backups. If matrixFallbackModels is empty, reuse chat fallbackModels.
 */
export async function getMatrixFallbackModels(): Promise<string[]> {
  const ai = await getAdminAiSettings();
  const dedicated = (ai.matrixFallbackModels ?? []).map((m) => m.trim()).filter(Boolean);
  if (dedicated.length) return dedicated;
  return (ai.fallbackModels ?? []).map((m) => m.trim()).filter(Boolean);
}

/** Deduped chain for matrix sectioned reading: primary + backups. */
export async function resolveMatrixModelChain(): Promise<string[]> {
  const primary = await getMatrixModel();
  const fallbacks = await getMatrixFallbackModels();
  const out: string[] = [];
  for (const raw of [primary, ...fallbacks]) {
    const model = raw?.trim();
    if (model && !out.includes(model)) out.push(model);
  }
  return out;
}
