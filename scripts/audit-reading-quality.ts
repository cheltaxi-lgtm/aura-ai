/**
 * Quality audit harness for paid spreads.
 * Reproduces the /api/intention-spread generation path and measures the result
 * against the product bar: premium density, no filler, verdict, full card coverage.
 *
 * Real LLM calls — manual / on-server only.
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/audit-reading-quality.ts
 */
import { writeFileSync } from "node:fs";

import { buildCharacterPrompt, generateReading } from "../src/lib/chat-prompts";
import { drawSpread, resolveSpreadDeckSystem, type DeckSystem } from "../src/lib/decks";
import { intentionSpreadPromptBlock } from "../src/lib/intention";
import {
  buildSpreadUserMessage,
  enrichCardsForSpreadContext,
  resolveIntentionLabel,
  userContextFromProfile,
} from "../src/lib/prompts/user-context";
import { getSpread, normalizeSpreadId, resolveSpreadPositions } from "../src/lib/spreads";
import { isPaidSpreadTextComplete } from "../src/lib/spread-reading-complete";
import { missingCardMentions } from "../src/lib/chat-reply-sanitize";
import type { SessionTopicId } from "../src/lib/session-topics";

import {
  contentWords,
  countSentences,
  countWords,
  fillerHits,
  glossEchoRatio,
  hasFinalBlock,
  hasSimplyWordsSection,
  hedgeHits,
  jaccard,
  mixesTuVy,
  openingLine,
  repeatedPhrases,
  verdictUpFront,
} from "./_reading-metrics";

type Scenario = {
  id: string;
  characterId: string;
  spreadId: string;
  intention: string;
  customQuestion?: string;
  /** Fixed seed keeps the draw reproducible across runs. */
  seed: number;
};

const SCENARIOS: Scenario[] = [
  // Same question + same draw across masters — lets us compare voices.
  { id: "voice-veronika", characterId: "veronika", spreadId: "triplet", intention: "custom", customQuestion: "Стоит ли мне уходить от мужа?", seed: 11 },
  { id: "voice-ragnar", characterId: "ragnar", spreadId: "triplet", intention: "custom", customQuestion: "Стоит ли мне уходить от мужа?", seed: 11 },
  { id: "voice-agafya", characterId: "agafya", spreadId: "triplet", intention: "custom", customQuestion: "Стоит ли мне уходить от мужа?", seed: 11 },

  // Spread size scaling.
  { id: "size-3-love", characterId: "veronika", spreadId: "triplet", intention: "love", seed: 21 },
  { id: "size-5-money", characterId: "veronika", spreadId: "situation-5", intention: "money", seed: 22 },
  { id: "size-10-celtic", characterId: "veronika", spreadId: "celtic-cross", intention: "custom", customQuestion: "Что происходит в моей карьере и куда всё идёт?", seed: 23 },

  // Hard topics.
  { id: "crisis-war", characterId: "veronika", spreadId: "triplet", intention: "custom", customQuestion: "Вернётся ли родной брат жены живым с войны?", seed: 31 },
  { id: "yesno-direct", characterId: "veronika", spreadId: "triplet", intention: "custom", customQuestion: "Он вернётся ко мне? Да или нет?", seed: 32 },
];

function seededRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

type Measured = {
  id: string;
  characterId: string;
  spreadId: string;
  cardCount: number;
  seconds: number;
  fromLlm: boolean;
  chars: number;
  words: number;
  sentences: number;
  paragraphs: number;
  perCardWords: number;
  cardsCovered: boolean;
  missing: string[];
  complete: boolean;
  filler: string[];
  hedges: number;
  glossEchoPct: number;
  repeatedPhrases: number;
  finalBlock: boolean;
  simplyWords: boolean;
  verdictUpFront: boolean;
  mixedAddress: boolean;
  boldNames: number;
  text: string;
};

async function measure(sc: Scenario): Promise<Measured> {
  const spreadId = normalizeSpreadId(sc.spreadId);
  const spread = getSpread(spreadId);
  const deckSystem: DeckSystem = resolveSpreadDeckSystem(spreadId, sc.characterId);
  const positions = resolveSpreadPositions(
    spreadId,
    sc.intention as SessionTopicId | null
  ).map((p) => p.label);

  const drawn = drawSpread(deckSystem, spread.cardCount, seededRng(sc.seed));
  const tarotCards = drawn.map((c) => ({ name: c.name, meaning: c.meaning }));

  const ctx = {
    userName: "Юлия",
    gender: "женский",
    zodiac: "Рыбы",
    birthDate: "1990-03-05",
    today: new Date().toISOString().slice(0, 10),
    tarotCards,
    isPaid: true,
  };

  let systemPrompt = buildCharacterPrompt(sc.characterId, ctx, {
    sessionNumber: 1,
    memory: [],
    intention: sc.intention,
    spreadId,
    customQuestion: sc.customQuestion ?? null,
  });
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

  const started = Date.now();
  const generated = await generateReading(systemPrompt, {
    userName: "Юлия",
    tarotCards,
    isPaid: true,
    characterId: sc.characterId,
    intention: sc.intention,
    spreadId,
    positionLabels: positions,
    userMessage,
  });
  const seconds = Math.round((Date.now() - started) / 100) / 10;

  const text = generated.text.trim();
  const cardNames = tarotCards.map((c) => c.name);
  const missing = missingCardMentions(text, cardNames);
  const words = countWords(text);

  return {
    id: sc.id,
    characterId: sc.characterId,
    spreadId,
    cardCount: drawn.length,
    seconds,
    fromLlm: generated.fromLlm,
    chars: text.length,
    words,
    sentences: countSentences(text),
    paragraphs: text.split(/\n{2,}/u).filter((p) => p.trim()).length,
    perCardWords: Math.round(words / Math.max(1, drawn.length)),
    cardsCovered: missing.length === 0,
    missing,
    complete: isPaidSpreadTextComplete(text, cardNames),
    filler: fillerHits(text),
    hedges: hedgeHits(text),
    glossEchoPct: glossEchoRatio(text, tarotCards.map((c) => c.meaning)),
    repeatedPhrases: repeatedPhrases(text),
    finalBlock: hasFinalBlock(text),
    simplyWords: hasSimplyWordsSection(text),
    verdictUpFront: verdictUpFront(text),
    mixedAddress: mixesTuVy(text),
    boldNames: cardNames.filter((n) => text.includes(`**${n}**`)).length,
    text,
  };
}

async function main() {
  const results: Measured[] = [];
  for (const sc of SCENARIOS) {
    process.stdout.write(`running ${sc.id}… `);
    try {
      const m = await measure(sc);
      results.push(m);
      console.log(`${m.seconds}s ${m.words} слов`);
    } catch (err) {
      console.log("THREW");
      console.error(err);
    }
  }

  console.log("\n=== МЕТРИКИ ===");
  console.log(
    [
      "сценарий".padEnd(18),
      "карт".padStart(5),
      "сек".padStart(6),
      "слов".padStart(6),
      "сл/карту".padStart(9),
      "предл".padStart(6),
      "абз".padStart(4),
      "покрытие".padStart(9),
      "вода".padStart(5),
      "hedge".padStart(6),
      "глосс%".padStart(7),
      "повтор".padStart(7),
      "финал".padStart(6),
      "##Прост".padStart(8),
      "вердикт".padStart(8),
      "ты/вы".padStart(6),
    ].join(" ")
  );
  for (const r of results) {
    console.log(
      [
        r.id.padEnd(18),
        String(r.cardCount).padStart(5),
        String(r.seconds).padStart(6),
        String(r.words).padStart(6),
        String(r.perCardWords).padStart(9),
        String(r.sentences).padStart(6),
        String(r.paragraphs).padStart(4),
        (r.cardsCovered ? "да" : `нет:${r.missing.length}`).padStart(9),
        String(r.filler.length).padStart(5),
        String(r.hedges).padStart(6),
        String(r.glossEchoPct).padStart(7),
        String(r.repeatedPhrases).padStart(7),
        (r.finalBlock ? "да" : "НЕТ").padStart(6),
        (r.simplyWords ? "да" : "НЕТ").padStart(8),
        (r.verdictUpFront ? "да" : "НЕТ").padStart(8),
        (r.mixedAddress ? "МИКС" : "ок").padStart(6),
      ].join(" ")
    );
  }

  const fillerAll = new Set(results.flatMap((r) => r.filler));
  console.log(`\nНайденная вода из бан-листа: ${[...fillerAll].join(", ") || "нет"}`);

  const voices = results.filter((r) => r.id.startsWith("voice-"));
  if (voices.length >= 2) {
    console.log("\n=== СХОЖЕСТЬ ГОЛОСОВ (один вопрос, одни карты) ===");
    for (let i = 0; i < voices.length; i++) {
      for (let j = i + 1; j < voices.length; j++) {
        const overlap = jaccard(contentWords(voices[i]!.text), contentWords(voices[j]!.text));
        console.log(
          `${voices[i]!.characterId} ↔ ${voices[j]!.characterId}: ${overlap}% общих значимых слов`
        );
      }
    }
  }

  console.log("\n=== ПЕРВАЯ СТРОКА КАЖДОГО ===");
  for (const r of results) console.log(`${r.id.padEnd(18)} | ${openingLine(r.text)}`);

  console.log("\n=== ПЕРВЫЕ 400 ЗНАКОВ КАЖДОГО ===");
  for (const r of results) {
    console.log(`\n--- ${r.id} (${r.characterId}) ---\n${r.text.slice(0, 400)}`);
  }

  writeFileSync("/tmp/reading-audit.json", JSON.stringify(results, null, 2), "utf8");
  console.log("\nПолные тексты: /tmp/reading-audit.json");
}

void main();
