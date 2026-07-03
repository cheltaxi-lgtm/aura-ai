import { getAllSpreadIntents, getSpreadIntentBySlug } from "./registry";
import type { SpreadIntentDefinition } from "./types";

/** Common phrasing → intent slug (checked before fuzzy scoring). */
const PHRASE_ALIASES: { pattern: RegExp; slug: string }[] = [
  { pattern: /верн[её]тся\s+ли\s+(он|она|муж|парень)/i, slug: "vernyotsya-li-on" },
  { pattern: /любит\s+ли\s+(он|она|меня)/i, slug: "lyubit-li-on-menya" },
  { pattern: /что\s+(он|она)\s+(чувств|дума)/i, slug: "chto-on-chuvstvuet" },
  { pattern: /есть\s+ли\s+(измен|другая|другой|любовниц)/i, slug: "est-li-izmena" },
  { pattern: /(измен|изменя)/i, slug: "est-li-izmena" },
  { pattern: /позвонит\s+ли|напишет\s+ли|напишут\s+ли/i, slug: "pozvonit-li-on" },
  { pattern: /почему\s+(он|она)\s+молч/i, slug: "pochemu-on-molchit" },
  { pattern: /будем\s+ли\s+мы\s+вместе/i, slug: "budem-li-my-vmeste" },
  { pattern: /совместим/i, slug: "sovmestimost-pary" },
  { pattern: /смен(ить|а)\s+работ/i, slug: "stoit-li-menyat-rabotu" },
  { pattern: /год\s+впер[её]д/i, slug: "god-vpered" },
  { pattern: /кельтск/i, slug: "chto-mezhdu-nami" },
  { pattern: /ленорман/i, slug: "lenormand-liniya" },
  { pattern: /отпуст(ить|ление)/i, slug: "kak-otpustit-cheloveka" },
  { pattern: /скуча(ет|ю)/i, slug: "skuchayet-li-on" },
  { pattern: /напиш(у|ет)\s+ли\s+(я|он|она)\s+перв/i, slug: "napisat-li-pervoy" },
  { pattern: /что\s+скрыва/i, slug: "chto-on-skryvaet" },
  { pattern: /перспектив/i, slug: "perspektiva-otnosheniy" },
  { pattern: /ближайш(ее|ая)\s+будущ/i, slug: "blizhayshee-budushchee" },
  { pattern: /деньг|финанс|доход/i, slug: "kuda-ukhodyat-dengi" },
  { pattern: /работ(а|у)|карьер/i, slug: "stoit-li-menyat-rabotu" },
];

const STOP_WORDS = new Set([
  "и",
  "в",
  "на",
  "ли",
  "что",
  "как",
  "мне",
  "меня",
  "мой",
  "моя",
  "будет",
  "можно",
  "нужно",
  "хочу",
  "узнать",
  "скажи",
  "покажи",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function scoreIntent(intent: SpreadIntentDefinition, tokens: string[], raw: string): number {
  let score = 0;
  const haystack = `${intent.title} ${intent.intro} ${intent.questionTemplate} ${intent.slug.replace(/-/g, " ")}`.toLowerCase();
  const rawLower = raw.toLowerCase();

  if (rawLower.includes(intent.title.toLowerCase())) score += 12;
  if (intent.isFeatured) score += 0.5;

  for (const token of tokens) {
    if (haystack.includes(token)) score += 2;
    if (intent.slug.includes(token)) score += 3;
  }

  const slugWords = intent.slug.split("-");
  for (const word of slugWords) {
    if (word.length < 4) continue;
    if (rawLower.includes(word)) score += 4;
  }

  return score;
}

/** Best matching catalog intent for a free-form user question. */
export function matchSpreadIntentFromQuestion(
  question: string
): SpreadIntentDefinition | null {
  const raw = question.trim();
  if (!raw) return null;

  for (const { pattern, slug } of PHRASE_ALIASES) {
    if (pattern.test(raw)) {
      const intent = getSpreadIntentBySlug(slug);
      if (intent) return intent;
    }
  }

  const tokens = tokenize(raw);
  if (tokens.length === 0) return null;

  let best: SpreadIntentDefinition | null = null;
  let bestScore = 0;

  for (const intent of getAllSpreadIntents()) {
    const score = scoreIntent(intent, tokens, raw);
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }

  return bestScore >= 4 ? best : null;
}
