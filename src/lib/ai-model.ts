import { getSetting, type AiSettings } from "@/lib/settings";

/** AI settings from admin panel (platform_settings key = 'ai'). */
export async function getAdminAiSettings(): Promise<AiSettings> {
  return getSetting("ai");
}

/** Primary chat/text model — always from admin settings. */
export async function getChatModel(): Promise<string> {
  const ai = await getAdminAiSettings();
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
