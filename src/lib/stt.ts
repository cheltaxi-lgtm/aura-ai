import { isOpenRouterConfigured } from "@/lib/llm";
import { openRouterAppHeaders } from "@/lib/brand";

const OPENROUTER_TRANSCRIBE_API = "https://openrouter.ai/api/v1/audio/transcriptions";
const DEFAULT_STT_MODEL = "openai/whisper-1";

function openRouterHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    ...openRouterAppHeaders(),
  };
}

function resolveSttModel(): string {
  const env = process.env.OPENROUTER_STT_MODEL?.trim();
  return env || DEFAULT_STT_MODEL;
}

/** Normalize MIME/extension to OpenRouter input_audio.format */
export function normalizeSttAudioFormat(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/^audio\//, "").split(";")[0]?.trim() ?? "webm";
  if (cleaned === "mpeg") return "mp3";
  if (cleaned === "x-wav") return "wav";
  if (cleaned === "ogg" || cleaned === "opus") return "ogg";
  return cleaned;
}

export function isSttConfigured(): boolean {
  return isOpenRouterConfigured();
}

export async function transcribeSpeech(params: {
  audioBase64: string;
  format: string;
  language?: string;
}): Promise<{ text: string } | null> {
  if (!isOpenRouterConfigured()) return null;

  const data = params.audioBase64.replace(/^data:[^;]+;base64,/, "").trim();
  if (!data) return null;

  const response = await fetch(OPENROUTER_TRANSCRIBE_API, {
    method: "POST",
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model: resolveSttModel(),
      language: params.language ?? "ru",
      input_audio: {
        data,
        format: normalizeSttAudioFormat(params.format),
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.warn("OpenRouter STT failed:", response.status, errText.slice(0, 300));
    return null;
  }

  const payload = (await response.json()) as { text?: string };
  const text = payload.text?.trim();
  if (!text) return null;
  return { text };
}
