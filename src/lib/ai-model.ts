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
