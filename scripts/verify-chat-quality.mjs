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
} from "../src/lib/chat-reply-sanitize.ts";
import { buildChatFallbackReply } from "../src/lib/chat-prompts.ts";
import { polishSpreadReadingText } from "../src/lib/reading-text-polish.ts";
import { parseCardNamesFromSpreadText } from "../src/lib/session-spread-meta.ts";
import {
  composeMemoryQueryText,
  expandIntentionForQuery,
  filterLlmMessagesByTopic,
  isTextRelevantToQuery,
} from "../src/lib/memory/memory-relevance.ts";

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

console.log(`\n--- ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
