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

console.log(`\n--- ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
