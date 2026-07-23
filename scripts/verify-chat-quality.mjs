/**
 * Chat reply quality regression tests (Yulia loop case + guards).
 * Run: npx tsx scripts/verify-chat-quality.mjs
 */
import {
  chatReplyRejectionReason,
  hasRepeatedPhrase,
  isDegenerateLlmOutput,
  isEchoingUserMessage,
  isRejectedChatReply,
  minCardMentionsRequired,
  missingCardMentions,
  resolveClientReadingText,
  sanitizeReadingForClient,
} from "../src/lib/chat-reply-sanitize.ts";
import { coerceSpreadReadingText } from "../src/lib/chat-reading-helpers.ts";
import { chatHasSpreadReading } from "../src/lib/chat-cache.ts";
import { resolveThematicTopicAngles } from "../src/lib/intention.ts";
import { sessionTopicToNumerologyTopics } from "../src/lib/numerology/topic-handlers.ts";
import { resolveSpreadPositions } from "../src/lib/spreads/registry.ts";
import { buildSpreadContinuePrompt } from "../src/lib/prose-completion.ts";
import {
  buildCardAwareFallbackReading,
  buildChatFallbackReply,
} from "../src/lib/repair/legacy-fallback-text.ts";
import { isPaidSpreadTextComplete } from "../src/lib/spread-reading-complete.ts";
import { polishSpreadReadingText } from "../src/lib/reading-text-polish.ts";
import { parseCardNamesFromSpreadText } from "../src/lib/session-spread-meta.ts";
import {
  composeMemoryQueryText,
  expandIntentionForQuery,
  filterLlmMessagesByTopic,
  isTextRelevantToQuery,
} from "../src/lib/memory/memory-relevance.ts";
import { validateUserSubmittedFact } from "../src/lib/memory/user-fact-input.ts";
import {
  formatMemoryFactForDisplay,
  normalizeUserFactPhrase,
} from "../src/lib/memory/user-fact-display.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let failed = 0;

function assert(name, cond) {
  if (!cond) {
    console.error(`[fail] ${name}`);
    failed++;
  } else {
    console.log(`[ok] ${name}`);
  }
}

const YULIA_OPENING = `![Феху](/decks/runes/fehu.png)
![Беркана](/decks/runes/berkano.png)
![Уруз](/decks/runes/uruz.png)

Юлия, Весы — * * в корне — энергия. * * — берёза. * * на горизонте — сила.`;

const polished = polishSpreadReadingText(YULIA_OPENING, ["Фехu", "Беркана", "Уруз"]);
assert("polish replaces empty stars", !/\*\s+\*/.test(polished));
assert(
  "polish inserts rune names",
  polished.includes("Фех") && polished.includes("Беркана") && polished.includes("Уруз")
);

const YULIA_LOOP = `Юлия, смотрю на твои руны.

**Фехu** в корне говорит, что старые страхи связаны с твоими решениями.

**Беркана** в центре говорит, что твои страхи связаны с твоими решениями.

**Уруз** на горизонте говорит, что твои страхи связаны с твоими решениями.

Страх принять неверное решение, которое может повлиять на моих детей.

Какие страхи связаны с твоими решениями?`;

const USER_FEAR =
  "Страх принять неверное решение, которое может повлиять на моих детей";

const SPREAD_SNIPPET = `![Фехu](/decks/runes/fehu.png)
![Беркана](/decks/runes/berkano.png)
![Уруз](/decks/runes/uruz.png)

**Фехu** · **Беркана** · **Уруз**`;

assert("Yulia loop is degenerate", isDegenerateLlmOutput(YULIA_LOOP));
assert("Yulia loop rejected for chat", isRejectedChatReply(YULIA_LOOP, { lastUserMessage: USER_FEAR }));
assert("has repeated phrase", hasRepeatedPhrase(YULIA_LOOP));
assert("echoes user message", isEchoingUserMessage(YULIA_LOOP, USER_FEAR));
assert(
  "rejection reason present",
  chatReplyRejectionReason(YULIA_LOOP, { lastUserMessage: USER_FEAR }) !== null
);

const parsed = parseCardNamesFromSpreadText(SPREAD_SNIPPET);
assert("parse 3 cards from spread", parsed.length === 3 && parsed.includes("Фехu"));

const fallback = buildChatFallbackReply("ragnar", {
  userName: "Юлия",
  lastUserMessage: "Переезд",
  cardNames: ["Фехu", "Беркана", "Уруз"],
  intention: "health",
});
assert("fallback mentions all runes", ["Фехu", "Беркана", "Уруз"].every((r) => fallback.includes(r)));
assert("fallback not loop", !isRejectedChatReply(fallback, { lastUserMessage: "Переезд" }));
assert("fallback long enough", fallback.length > 200);

const tarotFallbackCards = [
  { name: "Туз Мечей", meaning: "ясность" },
  { name: "Влюблённые", meaning: "выбор" },
  { name: "Колесница", meaning: "движение" },
  { name: "Отшельник", meaning: "уединение" },
  { name: "Солнце", meaning: "свет" },
];
const tarotFallback = buildCardAwareFallbackReading("veronika", {
  userName: "Геннадий",
  tarotCards: tarotFallbackCards,
  intention: "health",
  isPaid: true,
  spreadId: "triplet",
});
const tarotFallbackNames = tarotFallbackCards.map((c) => c.name);
assert(
  "card-aware fallback mentions all drawn cards",
  tarotFallbackNames.every((n) => tarotFallback.includes(n))
);
assert(
  "card-aware fallback survives sanitize",
  sanitizeReadingForClient(tarotFallback, tarotFallbackNames).length >= 200
);
assert(
  "card-aware fallback is paid-complete",
  isPaidSpreadTextComplete(tarotFallback, tarotFallbackNames)
);
assert(
  "card-aware fallback not degenerate",
  !isDegenerateLlmOutput(tarotFallback)
);

assert(
  "memory: career fact not relevant to love question",
  !isTextRelevantToQuery(
    "когда он вернётся ко мне",
    "чувство вины за поступок в начале карьеры на работе"
  )
);
assert(
  "memory: career fact relevant to career question",
  isTextRelevantToQuery(
    "стоит ли менять работу и уйти с текущей карьеры",
    "конфликт на работе и карьерный выбор"
  )
);
assert(
  "memory query prefers last user message",
  composeMemoryQueryText({
    lastUserMessage: "когда он вернётся ко мне",
    intention: "career",
    mainQuestion: "деньги и карьера",
  }) === "когда он вернётся ко мне"
);

assert(
  "memory query expands intention slug to Russian",
  composeMemoryQueryText({ intention: "money" }).includes("Деньги")
);

assert(
  "expandIntentionForQuery maps love slug",
  expandIntentionForQuery("love").includes("Любовь")
);

const filteredHistory = filterLlmMessagesByTopic(
  [
    { role: "user", content: "конфликт на работе и карьера" },
    { role: "assistant", content: "карьера требует терпения" },
    { role: "user", content: "когда он вернётся ко мне" },
    { role: "assistant", content: "любовь требует времени" },
  ],
  "когда он вернётся ко мне",
  10
);
assert(
  "filterLlmMessagesByTopic drops off-topic career turns",
  !filteredHistory.some((m) => m.content.includes("карьера"))
);
assert(
  "filterLlmMessagesByTopic keeps last user turn",
  filteredHistory.some((m) => m.content.includes("вернётся"))
);

assert(
  "user submitted fact normalizes first person",
  validateUserSubmittedFact("я работаю программистом")?.fact.includes("Клиент работает")
);
assert(
  "user fact normalizes living city without double prefix",
  normalizeUserFactPhrase("живу в городе Копейск") === "Клиент живёт в городе Копейск"
);
assert(
  "user fact display shows first person for cabinet",
  formatMemoryFactForDisplay("Клиент живёт в городе Копейск") === "Живу в городе Копейск"
);
assert(
  "user fact display strips redundant client prefix",
  formatMemoryFactForDisplay("У клиента 5 детей") === "5 детей"
);
assert(
  "user submitted fact rejects tarot meta",
  validateUserSubmittedFact("карта таро говорит о любви") === null
);

const root = resolve(import.meta.dirname, "..");
const humanChat = readFileSync(resolve(root, "src/lib/chat-prompts.ts"), "utf8");
assert(
  "human chat prompt includes card meanings and CARD_GROUNDED",
  humanChat.includes("Выпавшие карты (единственный источник выводов)") &&
    humanChat.includes("CARD_GROUNDED_READING_RULES")
);

const premiumReading = readFileSync(resolve(root, "src/lib/prompts/premium-reading.ts"), "utf8");
assert(
  "shared premium reading helper exists",
  premiumReading.includes("buildPaidSpreadReadingExtras") &&
    premiumReading.includes("paidSpreadMaxTokens") &&
    premiumReading.includes("ЧЕСТНОСТЬ ОПЛАЧЕННОГО РАСКЛАДА")
);

const honesty = readFileSync(resolve(root, "src/lib/prompt-policy.ts"), "utf8");
assert(
  "honesty policy names darkness without soft watering-down",
  honesty.includes("без смягчения") && honesty.includes("одна короткая фраза про выбор")
);

assert("min mentions: 5 cards require all 5", minCardMentionsRequired(5) === 5);
assert("min mentions: 10 cards require all 10", minCardMentionsRequired(10) === 10);
assert(
  "missing cards detected",
  missingCardMentions("Только Шут в раскладе.", ["Шут", "Маг", "Жрица"]).length === 2
);
assert(
  "sanitize rejects partial multi-card reading",
  sanitizeReadingForClient(
    "Шут говорит о начале. Долгий текст про путь и выборы, но без остальных карт.".repeat(3),
    ["Шут", "Маг", "Жрица", "Императрица", "Император"]
  ) === ""
);

const celticLove = resolveThematicTopicAngles("love", {
  spreadId: "celtic-cross",
  cardCount: 10,
  positionLabels: resolveSpreadPositions("celtic-cross", "love").map((p) => p.label),
});
assert(
  "love angles cover celtic-cross positions",
  celticLove.includes("КАЖДУЮ из 10") && celticLove.includes("Совет")
);
assert(
  "situation-5 money angles use position labels",
  resolveThematicTopicAngles("money", {
    spreadId: "situation-5",
    cardCount: 5,
  }).includes("Ситуация") &&
    resolveThematicTopicAngles("money", { spreadId: "situation-5", cardCount: 5 }).includes(
      "Итог"
    )
);

assert(
  "session love → sphere_relations",
  sessionTopicToNumerologyTopics("love")[0] === "sphere_relations"
);
assert(
  "session money → sphere_finance",
  sessionTopicToNumerologyTopics("money")[0] === "sphere_finance"
);
assert(
  "session life_death → no numerology auto topics",
  sessionTopicToNumerologyTopics("life_death").length === 0
);

const lifeDeathPos = resolveSpreadPositions("triplet", "life_death").map((p) => p.label);
assert(
  "life_death positions are state/circumstances/vector",
  lifeDeathPos.join("|") === "Состояние|Обстоятельства|Вектор"
);

assert(
  "continue prompt names missing cards",
  buildSpreadContinuePrompt("Шут открыл путь.", ["Шут", "Маг"]).includes("«Маг»")
);

const longPartial =
  "Шут говорит о начале пути. ".repeat(40) + "Много текста без других карт.";
assert(
  "resolveClientReadingText blocks incomplete long text",
  resolveClientReadingText(longPartial, ["Шут", "Маг", "Жрица"]) === ""
);
assert(
  "coerceSpreadReadingText blocks incomplete long text",
  coerceSpreadReadingText(longPartial, ["Шут", "Маг", "Жрица"]) === ""
);
assert(
  "chatHasSpreadReading false for incomplete long assistant msg",
  chatHasSpreadReading(
    [{ id: "1", role: "assistant", content: longPartial, timestamp: new Date() }],
    120,
    ["Шут", "Маг", "Жрица"]
  ) === false
);

console.log(`\n--- ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
