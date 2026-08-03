/**
 * Runtime (pure) checks for memory lifecycle helpers.
 * Run: npx tsx scripts/verify-memory-lifecycle.mjs
 */
import { supersedeGroupForPredicate } from "../src/lib/memory/predicates.ts";
import {
  factFingerprint,
  normalizeFactForFingerprint,
} from "../src/lib/memory/tombstones.ts";
import {
  filterGroundedFacts,
  quoteAppearsInSource,
} from "../src/lib/memory/grounding.ts";
import { buildRitualAnswersMessage } from "../src/lib/memory/capture-helpers.ts";
import { composeMemoryQueryText } from "../src/lib/memory/memory-relevance.ts";

let failed = 0;
function assert(name, cond) {
  if (!cond) {
    console.error(`[fail] ${name}`);
    failed++;
  } else {
    console.log(`[ok] ${name}`);
  }
}

assert(
  "employment.current and employment.searching share a supersede group",
  JSON.stringify(supersedeGroupForPredicate("employment.current")) ===
    JSON.stringify(["employment.current", "employment.searching"]) &&
    JSON.stringify(supersedeGroupForPredicate("employment.searching")) ===
      JSON.stringify(["employment.current", "employment.searching"])
);

assert(
  "goal.current is a singleton supersede group",
  JSON.stringify(supersedeGroupForPredicate("goal.current")) ===
    JSON.stringify(["goal.current"])
);

assert(
  "fingerprint is stable for whitespace/case variants",
  factFingerprint("Ищет работу в IT") === factFingerprint("  ищет   работу в it ")
);

assert(
  "normalizeFactForFingerprint collapses noise",
  normalizeFactForFingerprint('«Работа»') === "работа"
);

const userMsg =
  "Я сейчас ищу работу программистом, уже три месяца без офферов.";
assert(
  "grounding accepts quote present in user message",
  quoteAppearsInSource(userMsg, "ищу работу программистом")
);
assert(
  "grounding rejects assistant-only evidence",
  filterGroundedFacts(userMsg, [
    { fact: "Клиент ищет работу", evidenceQuote: "ищу работу программистом" },
    { fact: "Карты говорят о переезде", evidenceQuote: "переезд в другой город" },
  ]).length === 1
);

const ritualMsg = buildRitualAnswersMessage("release", [
  "Отпустить бывшего",
  "Хочу спокойствия",
]);
assert(
  "ritual answers message joins non-empty answers",
  ritualMsg.includes("Отпустить бывшего") && ritualMsg.includes("Хочу спокойствия")
);

assert(
  "short chat reply does not revive mainQuestion into query text",
  composeMemoryQueryText({
    lastUserMessage: "ок",
    mainQuestion: "Как наладить отношения с мужем после ссоры?",
    intention: null,
    customQuestion: null,
  }) === ""
);

assert(
  "empty query stays empty (no facts/events injection path)",
  composeMemoryQueryText({
    lastUserMessage: "",
    mainQuestion: "Как наладить отношения с мужем после ссоры?",
    intention: null,
    customQuestion: null,
  }) === ""
);

console.log(`\n--- ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
