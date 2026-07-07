import { speechModelSupportsRussian } from "@/lib/tts-locale";

export interface AdminModelOption {
  id: string;
  name: string;
  contextLength?: number;
  supportsVision: boolean;
  supportsSpeech: boolean;
  supportsImage: boolean;
  supportsRussian?: boolean;
  pricingHint?: string;
}

export type ModelListType = "chat" | "tts" | "image" | "vision";

export const FALLBACK_CHAT_MODELS: AdminModelOption[] = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", supportsVision: true, supportsSpeech: false, supportsImage: false },
  { id: "openai/gpt-4o", name: "GPT-4o", supportsVision: true, supportsSpeech: false, supportsImage: false },
  { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini", supportsVision: true, supportsSpeech: false, supportsImage: false },
  { id: "openai/gpt-4.1", name: "GPT-4.1", supportsVision: true, supportsSpeech: false, supportsImage: false },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", supportsVision: true, supportsSpeech: false, supportsImage: false },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", supportsVision: true, supportsSpeech: false, supportsImage: false },
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", supportsVision: true, supportsSpeech: false, supportsImage: false },
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", supportsVision: false, supportsSpeech: false, supportsImage: false },
  { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek Chat V3", supportsVision: false, supportsSpeech: false, supportsImage: false },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", supportsVision: false, supportsSpeech: false, supportsImage: false },
];

export const FALLBACK_TTS_MODELS: AdminModelOption[] = [
  { id: "google/gemini-3.1-flash-tts-preview", name: "Gemini 3.1 Flash TTS", supportsVision: false, supportsSpeech: true, supportsImage: false, supportsRussian: true },
  { id: "hexgrad/kokoro-82m", name: "Kokoro 82M", supportsVision: false, supportsSpeech: true, supportsImage: false, supportsRussian: false },
  { id: "microsoft/mai-voice-2", name: "MAI Voice 2", supportsVision: false, supportsSpeech: true, supportsImage: false, supportsRussian: true },
  { id: "mistralai/voxtral-mini-tts-2603", name: "Voxtral Mini TTS", supportsVision: false, supportsSpeech: true, supportsImage: false, supportsRussian: true },
  { id: "x-ai/grok-voice-tts-1.0", name: "Grok Voice TTS", supportsVision: false, supportsSpeech: true, supportsImage: false, supportsRussian: true },
  { id: "zyphra/zonos-v0.1-transformer", name: "Zonos v0.1 Transformer", supportsVision: false, supportsSpeech: true, supportsImage: false, supportsRussian: false },
  { id: "zyphra/zonos-v0.1-hybrid", name: "Zonos v0.1 Hybrid", supportsVision: false, supportsSpeech: true, supportsImage: false, supportsRussian: false },
  { id: "sesame/csm-1b", name: "Sesame CSM 1B", supportsVision: false, supportsSpeech: true, supportsImage: false, supportsRussian: false },
  { id: "canopylabs/orpheus-3b-0.1-ft", name: "Orpheus 3B", supportsVision: false, supportsSpeech: true, supportsImage: false, supportsRussian: false },
];

export const FALLBACK_IMAGE_MODELS: AdminModelOption[] = [
  { id: "bytedance-seed/seedream-4.5", name: "Seedream 4.5", supportsVision: false, supportsSpeech: false, supportsImage: true },
  { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image", supportsVision: false, supportsSpeech: false, supportsImage: true },
  { id: "google/gemini-3-pro-image", name: "Gemini 3 Pro Image", supportsVision: false, supportsSpeech: false, supportsImage: true },
  { id: "microsoft/mai-image-2.5", name: "MAI Image 2.5", supportsVision: false, supportsSpeech: false, supportsImage: true },
  { id: "sourceful/riverflow-v2.5-pro", name: "Riverflow v2.5 Pro", supportsVision: false, supportsSpeech: false, supportsImage: true },
  { id: "x-ai/grok-imagine-image-quality", name: "Grok Imagine Image", supportsVision: false, supportsSpeech: false, supportsImage: true },
];

type OpenRouterModelRow = {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string };
};

function pricingHintFromRow(m: OpenRouterModelRow): string | undefined {
  const prompt = m.pricing?.prompt ? parseFloat(m.pricing.prompt) * 1_000_000 : null;
  if (prompt === null || Number.isNaN(prompt)) return undefined;
  return `~$${prompt.toFixed(2)}/1M in`;
}

function mapOpenRouterRow(m: OpenRouterModelRow, listType: ModelListType): AdminModelOption {
  const inputModalities = m.architecture?.input_modalities ?? [];
  const outputModalities = m.architecture?.output_modalities ?? [];
  const supportsVision =
    inputModalities.includes("image") ||
    inputModalities.includes("file") ||
    /vision|4o|gemini|claude-3|claude-4|pixtral|gpt-5/i.test(m.id);
  const supportsSpeech =
    listType === "tts" ||
    outputModalities.includes("speech") ||
    outputModalities.some((mod) => /audio|speech|voice/i.test(mod)) ||
    /tts|kokoro|mai-voice|grok-voice|voxtral|zonos|orpheus|csm-1b/i.test(m.id);
  const supportsImage =
    listType === "image" ||
    outputModalities.includes("image") ||
    /seedream|flux|recraft|riverflow|mai-image|grok-imagine|gemini.*image|gpt-image/i.test(m.id);

  return {
    id: m.id,
    name: m.name ?? m.id,
    contextLength: m.context_length,
    supportsVision,
    supportsSpeech,
    supportsImage,
    supportsRussian: listType === "tts" ? speechModelSupportsRussian(m.id) : undefined,
    pricingHint: pricingHintFromRow(m),
  };
}

export function fallbackModelsForType(listType: ModelListType): AdminModelOption[] {
  if (listType === "tts") return FALLBACK_TTS_MODELS;
  if (listType === "image") return FALLBACK_IMAGE_MODELS;
  return FALLBACK_CHAT_MODELS;
}

export function mergeWithFallback(
  parsed: AdminModelOption[],
  fallback: AdminModelOption[]
): AdminModelOption[] {
  const byId = new Map<string, AdminModelOption>();
  for (const model of fallback) byId.set(model.id, model);
  for (const model of parsed) byId.set(model.id, model);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function parseOpenRouterPayload(payload: unknown, listType: ModelListType): AdminModelOption[] {
  const data = payload as { data?: OpenRouterModelRow[] };
  const fallback = fallbackModelsForType(listType);
  if (!Array.isArray(data.data)) return fallback;

  return data.data
    .map((m) => mapOpenRouterRow(m, listType))
    .filter((m) => {
      if (listType === "tts") return m.supportsSpeech;
      if (listType === "image") return m.supportsImage;
      if (listType === "vision") return m.supportsVision;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function resolveModelListType(param: string | null | undefined): ModelListType {
  if (param === "tts") return "tts";
  if (param === "image") return "image";
  if (param === "vision") return "vision";
  return "chat";
}

export function openRouterModelsUrl(listType: ModelListType): string {
  if (listType === "tts") return "https://openrouter.ai/api/v1/models?output_modalities=speech";
  if (listType === "image") return "https://openrouter.ai/api/v1/models?output_modalities=image";
  return "https://openrouter.ai/api/v1/models";
}

/** Normalize OpenRouter catalog response into admin picker options. */
export function modelsFromOpenRouterPayload(
  payload: unknown,
  listType: ModelListType
): AdminModelOption[] {
  const fallback = fallbackModelsForType(listType);
  const parsed = parseOpenRouterPayload(payload, listType);
  const models =
    listType === "chat" || listType === "vision"
      ? parsed
      : mergeWithFallback(parsed, fallback);
  return models.length ? models : fallback;
}
