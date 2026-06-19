/** OpenRouter TTS — /api/v1/audio/speech (тот же OPENROUTER_API_KEY) */

export function resolveGeminiTtsModel(): string {
  const env = process.env.OPENROUTER_TTS_MODEL?.trim();
  if (env?.includes("gemini")) return env;
  return "google/gemini-3.1-flash-tts-preview";
}

export const OPENROUTER_TTS_KOKORO_MODEL = "hexgrad/kokoro-82m";

export interface CharacterTtsProfile {
  /** Gemini TTS voice */
  geminiVoice: string;
  /** Kokoro TTS voice (mp3 fallback) */
  kokoroVoice: string;
  textPrefix?: string;
  instructions?: string;
  speed?: number;
}

export const CHARACTER_TTS: Record<string, CharacterTtsProfile> = {
  ragnar: {
    geminiVoice: "Charon",
    kokoroVoice: "bm_george",
    textPrefix: "[calm] ",
    instructions:
      "Говори по-русски. Низкий суровый мужской голос скандинавского мастера.",
    speed: 0.95,
  },
  veronika: {
    geminiVoice: "Kore",
    kokoroVoice: "af_bella",
    textPrefix: "[gentle] ",
    instructions: "Говори по-русски. Мягкий тёплый женский голос таролога.",
    speed: 0.98,
  },
  agafya: {
    geminiVoice: "Aoede",
    kokoroVoice: "bf_emma",
    textPrefix: "[whispers] ",
    instructions: "Говори по-русски. Голос славянской ведуньи — таинственный, хрипловатый.",
    speed: 0.92,
  },
  "shri-raj": {
    geminiVoice: "Orus",
    kokoroVoice: "am_adam",
    textPrefix: "[calm] ",
    instructions: "Говори по-русски. Спокойный мудрый голос гуру.",
    speed: 0.94,
  },
  default: {
    geminiVoice: "Kore",
    kokoroVoice: "af_sarah",
    textPrefix: "[gentle] ",
    instructions: "Говори по-русски. Тёплый мистический голос наставника.",
  },
};

export function resolveCharacterTts(characterId: string): CharacterTtsProfile {
  const base = CHARACTER_TTS[characterId] ?? CHARACTER_TTS.default;
  const envGeminiVoice = process.env[
    `OPENROUTER_TTS_VOICE_${characterId.toUpperCase().replace(/-/g, "_")}`
  ]?.trim();
  const envKokoroVoice = process.env[
    `OPENROUTER_TTS_KOKORO_${characterId.toUpperCase().replace(/-/g, "_")}`
  ]?.trim();

  return {
    ...base,
    geminiVoice: envGeminiVoice ?? base.geminiVoice,
    kokoroVoice: envKokoroVoice ?? base.kokoroVoice,
  };
}

/** ElevenLabs (опциональный fallback) */
export const ELEVENLABS_VOICE_IDS: Record<string, string> = {
  ragnar: "VR6AewLTigWG4xODbykL",
  veronika: "21m00Tcm4TlvDq8ikWAM",
  agafya: "XB0fDUnXU5powFXDhCwa",
  "shri-raj": "onwK4e9ZLuTAKqWW03F9",
  default: "21m00Tcm4TlvDq8ikWAM",
};

export function resolveElevenLabsVoiceId(characterId: string): string {
  const envKey = `ELEVENLABS_VOICE_${characterId.toUpperCase().replace(/-/g, "_")}`;
  const fromEnv = process.env[envKey];
  if (fromEnv?.trim()) return fromEnv.trim();
  return ELEVENLABS_VOICE_IDS[characterId] ?? ELEVENLABS_VOICE_IDS.default;
}

export const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

export const TTS_CHUNK_CHARS = 4000;
export const TTS_MAX_TOTAL_CHARS = 50000;

function resolveChunkSize(maxChunk?: number): number {
  const raw = Number(maxChunk);
  if (!Number.isFinite(raw) || raw <= 0) return TTS_CHUNK_CHARS;
  return Math.min(Math.max(Math.round(raw), 800), 4500);
}

/** Разбивка длинного расклада на части по абзацам/предложениям */
export function splitTextForTts(text: string, maxChunk?: number): string[] {
  const chunkSize = resolveChunkSize(maxChunk);
  let normalized = normalizeTextForTts(text);
  if (!normalized) return [];
  if (normalized.length > TTS_MAX_TOTAL_CHARS) {
    normalized = normalized.slice(0, TTS_MAX_TOTAL_CHARS).trim();
  }
  if (normalized.length <= chunkSize) return [normalized];

  const chunks: string[] = [];
  let rest = normalized;

  while (rest.length > 0) {
    if (rest.length <= chunkSize) {
      chunks.push(rest);
      break;
    }

    let slice = rest.slice(0, chunkSize);
    let breakAt = slice.lastIndexOf("\n\n");
    if (breakAt < chunkSize * 0.35) {
      breakAt = Math.max(
        slice.lastIndexOf(". "),
        slice.lastIndexOf("! "),
        slice.lastIndexOf("? "),
        slice.lastIndexOf("… ")
      );
    }
    if (breakAt < chunkSize * 0.35) {
      breakAt = slice.lastIndexOf(" ");
    }
    if (breakAt <= 0) {
      breakAt = chunkSize;
    } else {
      breakAt += 2;
    }

    const piece = rest.slice(0, breakAt).trim();
    if (piece) chunks.push(piece);
    rest = rest.slice(breakAt).trim();
  }

  return chunks;
}

/** Нормализация без обрезки — полный текст для озвучки */
export function normalizeTextForTts(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** @deprecated используйте normalizeTextForTts + splitTextForTts */
export function prepareTextForTts(text: string): string {
  return normalizeTextForTts(text);
}

export function parsePcmSampleRate(contentType: string): number {
  const match = contentType.match(/rate=(\d+)/i);
  return match ? parseInt(match[1], 10) : 24000;
}

/** PCM 16-bit mono → WAV для браузера */
export function pcm16ToWav(pcm: ArrayBuffer, sampleRate = 24000): ArrayBuffer {
  const pcmBytes = new Uint8Array(pcm);
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, pcmBytes.length, true);

  const out = new Uint8Array(44 + pcmBytes.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcmBytes, 44);
  return out.buffer;
}

const WAV_HEADER_BYTES = 44;

/** Склеивает несколько WAV (PCM) в один файл */
export function mergeWavBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 1) return buffers[0];
  const pcmParts: Uint8Array[] = [];
  for (const buf of buffers) {
    const bytes = new Uint8Array(buf);
    if (bytes.length > WAV_HEADER_BYTES) {
      pcmParts.push(bytes.slice(WAV_HEADER_BYTES));
    }
  }
  const totalPcm = pcmParts.reduce((sum, part) => sum + part.length, 0);
  const mergedPcm = new Uint8Array(totalPcm);
  let offset = 0;
  for (const part of pcmParts) {
    mergedPcm.set(part, offset);
    offset += part.length;
  }
  return pcm16ToWav(mergedPcm.buffer);
}

/** Склеивает MP3-чанки (одинаковый кодек) */
export function mergeMp3Buffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 1) return buffers[0];
  const total = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const buf of buffers) {
    out.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return out.buffer;
}
