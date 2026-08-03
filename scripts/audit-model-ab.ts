/**
 * A/B: same paid-spread prompt, different models.
 * Separates "prompt problem" from "model problem" without touching prod settings.
 *
 * Real LLM calls — manual / on-server only.
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/audit-model-ab.ts
 */
import { buildCharacterPrompt } from "../src/lib/chat-prompts";
import { drawSpread, resolveSpreadDeckSystem, type DeckSystem } from "../src/lib/decks";
import { intentionSpreadPromptBlock } from "../src/lib/intention";
import { completeChatDetailed } from "../src/lib/llm";
import { wrapSystemPrompt } from "../src/lib/prompt-policy";
import {
  buildSpreadUserMessage,
  enrichCardsForSpreadContext,
  resolveIntentionLabel,
  userContextFromProfile,
} from "../src/lib/prompts/user-context";
import { getSpread, normalizeSpreadId, resolveSpreadPositions } from "../src/lib/spreads";
import { missingCardMentions } from "../src/lib/chat-reply-sanitize";
import type { SessionTopicId } from "../src/lib/session-topics";
import {
  countSentences,
  countWords,
  fillerHits,
  glossEchoRatio,
  hasFinalBlock,
  hedgeHits,
  mixesTuVy,
  verdictUpFront,
} from "./_reading-metrics";

const MODELS = [
  "openai/gpt-4o-mini",
  "deepseek/deepseek-chat-v3-0324",
  "moonshotai/kimi-k2.5",
  "anthropic/claude-sonnet-4.5",
];

type Scenario = {
  id: string;
  characterId: string;
  spreadId: string;
  intention: string;
  customQuestion?: string;
  seed: number;
};

const SCENARIOS: Scenario[] = [
  { id: "love-3", characterId: "veronika", spreadId: "triplet", intention: "custom", customQuestion: "Стоит ли мне уходить от мужа?", seed: 11 },
  { id: "crisis-war", characterId: "veronika", spreadId: "triplet", intention: "custom", customQuestion: "Вернётся ли родной брат жены живым с войны?", seed: 31 },
];

function seededRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function buildMessages(sc: Scenario) {
  const spreadId = normalizeSpreadId(sc.spreadId);
  const spread = getSpread(spreadId);
  const deckSystem: DeckSystem = resolveSpreadDeckSystem(spreadId, sc.characterId);
  const positions = resolveSpreadPositions(spreadId, sc.intention as SessionTopicId | null).map(
    (p) => p.label
  );
  const drawn = drawSpread(deckSystem, spread.cardCount, seededRng(sc.seed));
  const tarotCards = drawn.map((c) => ({ name: c.name, meaning: c.meaning }));

  let systemPrompt = buildCharacterPrompt(
    sc.characterId,
    {
      userName: "Юлия",
      gender: "женский",
      zodiac: "Рыбы",
      birthDate: "1990-03-05",
      today: new Date().toISOString().slice(0, 10),
      tarotCards,
      isPaid: true,
    },
    {
      sessionNumber: 1,
      memory: [],
      intention: sc.intention,
      spreadId,
      customQuestion: sc.customQuestion ?? null,
    }
  );
  systemPrompt += intentionSpreadPromptBlock(sc.intention, sc.customQuestion, {
    spreadId,
    cardCount: drawn.length,
    positionLabels: positions,
  });

  const userMessage = buildSpreadUserMessage({
    user: userContextFromProfile({ name: "Юлия", gender: "женский", birthDate: "1990-03-05", zodiac: "Рыбы" }),
    cards: enrichCardsForSpreadContext(deckSystem, tarotCards, positions),
    intention: sc.customQuestion ?? resolveIntentionLabel(sc.intention),
  });

  return {
    tarotCards,
    messages: [
      { role: "system" as const, content: await wrapSystemPrompt(systemPrompt) },
      { role: "user" as const, content: userMessage },
    ],
  };
}

async function main() {
  console.log(
    ["сценарий/модель".padEnd(46), "сек".padStart(6), "слов".padStart(6), "предл".padStart(6), "покр".padStart(5), "вода".padStart(5), "hedge".padStart(6), "глосс%".padStart(7), "финал".padStart(6), "вердикт".padStart(8), "ты/вы".padStart(6)].join(" ")
  );

  const samples: { key: string; text: string }[] = [];

  for (const sc of SCENARIOS) {
    const { messages, tarotCards } = await buildMessages(sc);
    const cardNames = tarotCards.map((c) => c.name);
    for (const model of MODELS) {
      const started = Date.now();
      let text = "";
      try {
        const res = await completeChatDetailed({
          messages,
          maxTokens: 2600,
          temperature: 0.85,
          timeoutMs: 120_000,
          modelOverride: model,
          skipTemperatureRetry: true,
        });
        text = (res.text ?? "").trim();
      } catch (err) {
        console.log(`${`${sc.id} / ${model}`.padEnd(46)} FAILED ${(err as Error).message}`);
        continue;
      }
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      const missing = missingCardMentions(text, cardNames);
      console.log(
        [
          `${sc.id} / ${model}`.padEnd(46),
          String(seconds).padStart(6),
          String(countWords(text)).padStart(6),
          String(countSentences(text)).padStart(6),
          (missing.length ? `нет` : "да").padStart(5),
          String(fillerHits(text).length).padStart(5),
          String(hedgeHits(text)).padStart(6),
          String(glossEchoRatio(text, tarotCards.map((c) => c.meaning))).padStart(7),
          (hasFinalBlock(text) ? "да" : "НЕТ").padStart(6),
          (verdictUpFront(text) ? "да" : "НЕТ").padStart(8),
          (mixesTuVy(text) ? "МИКС" : "ок").padStart(6),
        ].join(" ")
      );
      samples.push({ key: `${sc.id} / ${model}`, text });
    }
  }

  console.log("\n=== ОТКРЫТИЕ И ФИНАЛ КАЖДОГО ===");
  for (const s of samples) {
    console.log(`\n--- ${s.key} ---`);
    console.log(`НАЧАЛО: ${s.text.slice(0, 260)}`);
    console.log(`ФИНАЛ: …${s.text.slice(-320)}`);
  }
}

void main();
