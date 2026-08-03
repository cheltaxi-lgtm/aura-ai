import { botConfig } from "../../config.js";
import type { TtsProvider, TtsResult } from "./types.js";

/** OpenAI-compatible audio speech via OpenRouter or OpenAI base. */
export class OpenRouterTtsProvider implements TtsProvider {
  async synthesize(text: string): Promise<TtsResult> {
    if (!botConfig.ttsApiKey) {
      return { ok: false, reason: "no_key" };
    }
    const clipped = text.length > 700 ? `${text.slice(0, 680)}…` : text;
    try {
      const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${botConfig.ttsApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": botConfig.siteUrl,
          "X-Title": "Zovus Telegram Bot",
        },
        body: JSON.stringify({
          model: botConfig.ttsModel,
          voice: botConfig.ttsVoice,
          input: clipped,
          response_format: "opus",
        }),
      });
      if (!res.ok) {
        return { ok: false, reason: `http_${res.status}` };
      }
      const ab = await res.arrayBuffer();
      const ogg = Buffer.from(ab);
      if (ogg.length < 100) return { ok: false, reason: "empty" };
      // Rough estimate: opus ~3KB/s
      const durationSec = Math.max(5, Math.min(botConfig.ttsMaxSeconds, Math.round(ogg.length / 3000)));
      if (durationSec > botConfig.ttsMaxSeconds) {
        return { ok: false, reason: "too_long" };
      }
      return { ok: true, ogg, durationSec };
    } catch {
      return { ok: false, reason: "network" };
    }
  }
}

export const ttsProvider: TtsProvider = new OpenRouterTtsProvider();
