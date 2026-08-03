import { botConfig } from "../../config.js";
import { consumeLlmQuota, hasLlmQuota } from "../../db/repos.js";
import { isLlmEnabled } from "../../flags.js";
import type { DrawnCard } from "../deck/types.js";
import {
  buildTeaserSystemPrompt,
  buildTeaserUserPrompt,
  fallbackTeaser,
  TEASER_PROMPT_VERSION,
} from "./prompt.js";

export type TeaserResult = {
  text: string;
  model: string;
  promptVersion: string;
  source: "llm" | "fallback";
  seed: string;
};

export async function generateTeaser(
  question: string,
  cards: DrawnCard[],
  telegramUserId?: number
): Promise<TeaserResult> {
  const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const fallback = {
    text: fallbackTeaser(question, cards),
    model: "fallback",
    promptVersion: TEASER_PROMPT_VERSION,
    source: "fallback" as const,
    seed,
  };

  if (!isLlmEnabled()) return fallback;
  if (!botConfig.openRouterApiKey) return fallback;
  if (telegramUserId != null && !hasLlmQuota(telegramUserId)) return fallback;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botConfig.openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": botConfig.siteUrl,
        "X-Title": "Zovus Telegram Bot",
      },
      body: JSON.stringify({
        model: botConfig.openRouterModel,
        temperature: 0.7,
        max_tokens: 320,
        messages: [
          { role: "system", content: buildTeaserSystemPrompt() },
          {
            role: "user",
            content: buildTeaserUserPrompt({
              question,
              cards: cards.map((c) => ({
                name: c.name,
                reversed: c.reversed,
                meaningHint: c.meaning,
              })),
            }),
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error("[teaser] LLM HTTP", res.status);
      return fallback;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text || text.length < 40) return fallback;
    if (telegramUserId != null) consumeLlmQuota(telegramUserId);
    return {
      text: text.slice(0, 1200),
      model: botConfig.openRouterModel,
      promptVersion: TEASER_PROMPT_VERSION,
      source: "llm",
      seed,
    };
  } catch (err) {
    console.error("[teaser] LLM error", err);
    return fallback;
  }
}

export function dayCardText(card: DrawnCard): string {
  const orient = card.reversed ? "в перевёрнутом положении" : "в прямом положении";
  return [
    `Сегодня с вами «${card.name}» ${orient}.`,
    `${card.meaning}.`,
    `Один мягкий шаг на день важнее десяти планов.`,
  ].join(" ");
}
