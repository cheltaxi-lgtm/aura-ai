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
import {
  canMutateExistingFact,
  isProtectedFact,
} from "../src/lib/memory/authority.ts";
import { entitiesCompatibleForMerge, personEntityKey } from "../src/lib/memory/entities.ts";
import { expandMemoryQuery } from "../src/lib/memory/query-expansion.ts";
import { classifyFactConflict } from "../src/lib/memory/contradictions.ts";

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

assert(
  "manual fact is protected from auto overwrite",
  isProtectedFact({ sourceType: "user", captureTier: "user_confirmed" }) &&
    !canMutateExistingFact(
      { sourceType: "user", captureTier: "user_confirmed" },
      { sourceType: "chat", captureTier: "durable" }
    )
);

assert(
  "same first name with different roles does not merge",
  entitiesCompatibleForMerge(
    { entityKey: personEntityKey("Сергей", "former_spouse") },
    { entityKey: personEntityKey("Сергей", "colleague") }
  ) === false
);

assert(
  "work question expands to employment predicates",
  expandMemoryQuery("Стоит ли менять работу?").predicateHints.includes("employment.current")
);

assert(
  "employment change is a temporal update",
  classifyFactConflict(
    { fact: "Клиент ищет работу", predicateKey: "employment.searching" },
    { fact: "Клиент устроился", predicateKey: "employment.current", operation: "replace" }
  ) === "temporal_update"
);

console.log(`\n--- ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
