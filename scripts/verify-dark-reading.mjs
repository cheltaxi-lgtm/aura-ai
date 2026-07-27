/**
 * Smoke: dark/negative paid reading prompts must allow blunt shadow naming.
 * Run: npx tsx scripts/verify-dark-reading.mjs
 */
import { wrapSystemPrompt, HONESTY_POLICY } from "../src/lib/prompt-policy.ts";
import {
  DARK_TOPICS_POLICY,
  CARD_GROUNDED_READING_RULES,
} from "../src/lib/prompts/format.ts";
import { buildPaidSpreadReadingExtras } from "../src/lib/prompts/premium-reading.ts";
import { buildCharacterPrompt } from "../src/lib/chat-prompts.ts";
import { detectTopics, mergeTopics } from "../src/lib/prompts/topics.ts";

let failed = 0;
function assert(name, cond) {
  if (!cond) {
    console.error(`[fail] ${name}`);
    failed++;
  } else {
    console.log(`[ok] ${name}`);
  }
}

const extras = buildPaidSpreadReadingExtras({ cardCount: 3, masterId: "ragnar" });
const reading = buildCharacterPrompt(
  "ragnar",
  {
    userName: "Алекс",
    gender: "Мужской",
    zodiac: "Скорпион",
    birthDate: "01.11.1990",
    today: "20 июля 2026",
    isPaid: true,
    tarotCards: [
      { name: "Тройка Мечей", meaning: "боль, разрыв, предательство в сердце" },
      { name: "Башня", meaning: "обрушение, внезапный кризис" },
      { name: "Десятка Мечей", meaning: "дно, конец цикла, удар в спину" },
    ],
    mainQuestion: "изменяет ли она мне?",
  },
  {
    intention: "love",
    forceThematicReading: true,
    lastUserMessage: "изменяет ли она мне?",
  }
);

const wrapped = await wrapSystemPrompt(`${reading}\n\n${extras}`);

assert("honesty forbids soft watering of shadow", /без смягчения/.test(HONESTY_POLICY));
assert("honesty forbids only-positive readings", /Только позитив запрещён/.test(HONESTY_POLICY));
assert("dark policy bans «возможны трудности» watering", /возможны трудности/.test(DARK_TOPICS_POLICY));
assert("dark policy requires direct acknowledgment", /прямо и без смягчений/.test(DARK_TOPICS_POLICY));
assert(
  "dark policy requires shadow in every reading",
  /ТЕНЬ В КАЖДОМ РАСКЛАДЕ/.test(DARK_TOPICS_POLICY) && /Только позитив — ложь/.test(DARK_TOPICS_POLICY)
);
assert(
  "dark policy strengthens underside of light cards",
  /изнанку по символам|Тёмную сторону усиливай/.test(DARK_TOPICS_POLICY)
);
assert("card-grounded names shadow directly", /называй прямо/.test(CARD_GROUNDED_READING_RULES));
assert(
  "card-grounded forbids only-positive full readings",
  /Только позитив запрещён/.test(CARD_GROUNDED_READING_RULES)
);
assert("premium extras: no forbidden topics", /Нет запретных тем расклада/.test(extras));
assert("premium extras: name pain/break/cold", /разрыв, холод, риск, боль/.test(extras));
assert(
  "premium extras: require resource AND shadow",
  /опора\/ресурс И тень/.test(extras) || /опора\/ресурс И тень\/цена\/риск/.test(extras)
);
assert("reading prompt includes dark card names", wrapped.includes("Тройка Мечей") && wrapped.includes("Башня"));
assert("reading prompt includes betrayal meanings", wrapped.includes("предательство"));
assert("wrap injects honesty + dark policies", wrapped.includes("ПОЛИТИКА ЧЕСТНОСТИ") && wrapped.includes("ТЁМНЫЕ ТЕМЫ"));
assert("wrap injects premium honesty block", wrapped.includes("ЧЕСТНОСТЬ ОПЛАЧЕННОГО РАСКЛАДА"));
assert("thematic depth present for paid love", /28|предложений/.test(wrapped));
assert(
  "honesty forbids topic refusal phrasing",
  /Не отказывай|нет запретных тем/i.test(wrapped)
);
assert(
  "does not instruct refusing betrayal topic",
  !/запрещено говорить о измене|не обсуждаю тёмные темы|откажись от темы измен/i.test(wrapped)
);

// Curse / black-magic topic must still be card-first, not banned
const curseTopics = detectTopics("на меня порча и чёрная магия");
assert("curse/black-magic topic is recognized", curseTopics.includes("curse"));
assert(
  "mergeTopics keeps curse from message",
  mergeTopics("на меня порча и чёрная магия", "love").includes("curse")
);

const curseReading = buildCharacterPrompt(
  "agafya",
  {
    userName: "Мария",
    gender: "Женский",
    zodiac: "Рыбы",
    birthDate: "03.03.1988",
    today: "20 июля 2026",
    isPaid: true,
    tarotCards: [
      { name: "Дьявол", meaning: "зависимость, чужое влияние, тень" },
      { name: "Луна", meaning: "обман, страх, туман" },
      { name: "Hagalaz", meaning: "ломка, разрушение старого" },
    ],
    mainQuestion: "на меня порча?",
  },
  {
    forceThematicReading: true,
    lastUserMessage: "на меня порча и чёрная магия?",
  }
);
const curseWrapped = await wrapSystemPrompt(
  `${curseReading}\n\n${buildPaidSpreadReadingExtras({ cardCount: 3, masterId: "agafya" })}`
);
assert("curse reading keeps dark symbols", curseWrapped.includes("Дьявол") && curseWrapped.includes("Hagalaz"));
assert(
  "curse reading injects topic guidance or honesty",
  curseWrapped.includes("порч") || curseWrapped.includes("Нет запретных тем расклада")
);
assert(
  "curse reading does not refuse black magic topic",
  !/не могу говорить о порче|запретная тема|отказываюсь/i.test(curseWrapped)
);

console.log(`\n--- ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
