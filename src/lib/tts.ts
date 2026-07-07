import {
  parsePcmSampleRate,
  pcm16ToWav,
  splitTextForTts,
  resolveCharacterTts,
  type CharacterTtsProfile,
  resolveElevenLabsVoiceId,
  mergeMp3Buffers,
  mergeWavBuffers,
  ELEVENLABS_MODEL,
  TTS_CHUNK_CHARS,
} from "@/lib/voice-config";
import { isOpenRouterConfigured } from "@/lib/llm";
import { withLlmSlot } from "@/lib/llm-concurrency";
import { openRouterAppHeaders } from "@/lib/brand";
import { openRouterFetch } from "@/lib/openrouter-fetch";
import { getSetting, type TtsSettings } from "@/lib/settings";
import { isPrimarilyCyrillic, reorderTtsModelChainForText } from "@/lib/tts-locale";

const OPENROUTER_SPEECH_API = "https://openrouter.ai/api/v1/audio/speech";
const ELEVENLABS_API = "https://api.elevenlabs.io/v1/text-to-speech";
const GEMINI_TTS_MODEL = "google/gemini-3.1-flash-tts-preview";
const KOKORO_TTS_MODEL = "hexgrad/kokoro-82m";

function isPlaceholder(key?: string): boolean {
  return !key || key.startsWith("sk-your") || key.startsWith("your-");
}

export type TtsProvider = "openrouter" | "elevenlabs" | "openai";

export interface SynthesizeResult {
  buffer: ArrayBuffer;
  contentType: string;
  provider: TtsProvider;
  model?: string;
  chunks?: number;
  parts?: ArrayBuffer[];
  partial?: boolean;
  localeRouted?: boolean;
}

function openRouterSpeechHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    ...openRouterAppHeaders(),
  };
}

async function callOpenRouterSpeech(body: Record<string, unknown>): Promise<SynthesizeResult | null> {
  return withLlmSlot(`tts:${body.model ?? "unknown"}`, async () => {
  const response = await openRouterFetch(OPENROUTER_SPEECH_API, {
    method: "POST",
    headers: openRouterSpeechHeaders(),
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok || contentType.includes("application/json")) {
    const errText = contentType.includes("json")
      ? await response.text().catch(() => "")
      : "";
    console.warn("OpenRouter TTS failed:", response.status, body.model, errText.slice(0, 300));
    return null;
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength < 256) {
    console.warn("OpenRouter TTS empty buffer:", body.model);
    return null;
  }

  const format = body.response_format as string;

  if (format === "pcm" || contentType.toLowerCase().includes("pcm")) {
    return {
      buffer: pcm16ToWav(buffer, parsePcmSampleRate(contentType)),
      contentType: "audio/wav",
      provider: "openrouter",
      model: String(body.model),
    };
  }

  return {
    buffer,
    contentType: contentType.includes("mpeg") ? "audio/mpeg" : contentType || "audio/mpeg",
    provider: "openrouter",
    model: String(body.model),
  };
  });
}

function isGeminiTtsModel(model: string): boolean {
  return model.includes("gemini");
}

function resolvePrimaryModel(settings: TtsSettings): string {
  const env = process.env.OPENROUTER_TTS_MODEL?.trim();
  return env || settings.model || GEMINI_TTS_MODEL;
}

function resolveChunkChars(settings: TtsSettings): number {
  const raw = Number(settings.chunkChars);
  if (!Number.isFinite(raw) || raw <= 0) return TTS_CHUNK_CHARS;
  return Math.min(Math.max(Math.round(raw), 800), 4500);
}

function buildModelChain(settings: TtsSettings, text: string): string[] {
  const primary = resolvePrimaryModel(settings);
  const chain: string[] = [primary];

  if (
    settings.fallbackEnabled &&
    settings.fallbackModel?.trim() &&
    settings.fallbackModel !== primary
  ) {
    chain.push(settings.fallbackModel.trim());
  }
  if (!chain.includes(GEMINI_TTS_MODEL)) chain.push(GEMINI_TTS_MODEL);

  if (!isPrimarilyCyrillic(text) && !chain.includes(KOKORO_TTS_MODEL)) {
    chain.push(KOKORO_TTS_MODEL);
  }

  return reorderTtsModelChainForText(chain, text);
}

async function synthesizeWithOpenRouterModel(
  text: string,
  profile: CharacterTtsProfile,
  model: string
): Promise<SynthesizeResult | null> {
  if (isGeminiTtsModel(model)) {
    return callOpenRouterSpeech({
      model,
      input: text,
      voice: profile.geminiVoice,
      response_format: "pcm",
      speed: profile.speed ?? 1.0,
    });
  }

  const body: Record<string, unknown> = {
    model,
    input: text,
    voice: profile.kokoroVoice,
    response_format: "mp3",
    speed: profile.speed ?? 1.0,
  };

  if (profile.instructions && model.includes("gpt-4o-mini-tts")) {
    body.provider = { options: { openai: { instructions: profile.instructions } } };
  }

  return callOpenRouterSpeech(body);
}

async function synthesizeAllChunksWithModel(
  chunkInputs: string[],
  profile: CharacterTtsProfile,
  model: string,
  parallel = 2
): Promise<SynthesizeResult[] | null> {
  if (chunkInputs.length === 1) {
    const single = await synthesizeWithOpenRouterModel(chunkInputs[0], profile, model);
    return single ? [single] : null;
  }

  const parts: Array<SynthesizeResult | null> = new Array(chunkInputs.length).fill(null);

  for (let start = 0; start < chunkInputs.length; start += parallel) {
    const batch = chunkInputs.slice(start, start + parallel);
    const batchResults = await Promise.all(
      batch.map((input) => synthesizeWithOpenRouterModel(input, profile, model))
    );
    if (batchResults.some((part) => !part)) return null;
    batchResults.forEach((part, index) => {
      parts[start + index] = part;
    });
  }

  return parts as SynthesizeResult[];
}

async function synthesizeOpenRouter(
  chunkInputs: string[],
  characterId: string,
  settings: TtsSettings
): Promise<SynthesizeResult | null> {
  if (!isOpenRouterConfigured()) return null;

  const profile = resolveCharacterTts(characterId);
  if (!profile) return null;
  const fullText = chunkInputs.join(" ");
  const modelChain = buildModelChain(settings, fullText);
  const primary = resolvePrimaryModel(settings);
  const localeRouted =
    isPrimarilyCyrillic(fullText) &&
    modelChain[0] !== primary &&
    /kokoro|orpheus|zonos|csm-1b/i.test(primary);

  for (const model of modelChain) {
    const parts = await synthesizeAllChunksWithModel(chunkInputs, profile, model);
    if (parts) {
      const merged = mergeResults(parts);
      return localeRouted ? { ...merged, localeRouted: true } : merged;
    }
    console.warn("TTS model failed for all chunks:", model);
  }

  return null;
}

async function synthesizeElevenLabs(text: string, characterId: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (isPlaceholder(apiKey)) return null;

  const voiceId = resolveElevenLabsVoiceId(characterId);
  const response = await fetch(`${ELEVENLABS_API}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey!,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) return null;
  return response.arrayBuffer();
}

const OPENAI_DIRECT_VOICES: Record<string, string> = {
  ragnar: "onyx",
  veronika: "nova",
  agafya: "shimmer",
  "shri-raj": "fable",
  default: "nova",
};

async function synthesizeOpenAiDirect(text: string, characterId: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (isPlaceholder(apiKey)) return null;

  const voice = OPENAI_DIRECT_VOICES[characterId] ?? OPENAI_DIRECT_VOICES.default;
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1-hd",
      voice,
      input: text,
      response_format: "mp3",
    }),
  });

  if (!response.ok) return null;
  return response.arrayBuffer();
}

function mergeResults(parts: SynthesizeResult[]): SynthesizeResult {
  const partBuffers = parts.map((p) => p.buffer);
  if (parts.length === 1) {
    return { ...parts[0], chunks: 1, parts: partBuffers };
  }

  const allWav = parts.every((p) => p.contentType.includes("wav"));
  const mergedBuffer = allWav
    ? mergeWavBuffers(partBuffers)
    : mergeMp3Buffers(partBuffers);

  return {
    buffer: mergedBuffer,
    contentType: allWav ? "audio/wav" : "audio/mpeg",
    provider: parts[0].provider,
    model: parts[0].model,
    chunks: parts.length,
    parts: partBuffers,
  };
}

export async function isTtsEnabled(): Promise<boolean> {
  const tts = await getSetting("tts");
  return tts.enabled === true;
}

export function isTtsConfigured(): boolean {
  return (
    isOpenRouterConfigured() ||
    !isPlaceholder(process.env.ELEVENLABS_API_KEY) ||
    !isPlaceholder(process.env.OPENAI_API_KEY)
  );
}

export async function synthesizeSpeech(
  rawText: string,
  characterId: string
): Promise<SynthesizeResult | null> {
  const ttsSettings = await getSetting("tts");
  const chunkSize = resolveChunkChars(ttsSettings);
  const chunks = splitTextForTts(rawText, chunkSize);
  if (!chunks.length) return null;

  const profile = resolveCharacterTts(characterId);
  if (!profile) return null;
  const modelChain = buildModelChain(ttsSettings, rawText);
  const useGeminiTags = modelChain.length > 0 && isGeminiTtsModel(modelChain[0]);

  const chunkInputs = chunks.map((chunk, i) =>
    i === 0 && profile.textPrefix && useGeminiTags ? `${profile.textPrefix}${chunk}` : chunk
  );

  const openRouter = await synthesizeOpenRouter(chunkInputs, characterId, ttsSettings);
  if (openRouter) return openRouter;

  const fullText = chunks.join(" ");
  const eleven = await synthesizeElevenLabs(fullText, characterId);
  if (eleven) {
    return { buffer: eleven, contentType: "audio/mpeg", provider: "elevenlabs", chunks: chunks.length };
  }

  const openai = await synthesizeOpenAiDirect(fullText, characterId);
  if (openai) {
    return { buffer: openai, contentType: "audio/mpeg", provider: "openai", chunks: chunks.length };
  }

  return null;
}
