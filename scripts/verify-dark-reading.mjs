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
assert("honesty requires dominant-symbol verdict", /Вердикт по доминирующим/.test(HONESTY_POLICY));
assert("honesty bans dawn sugar", /рассвет близко/.test(HONESTY_POLICY));
assert("dark policy bans «возможны трудности» watering", /возможны трудности/.test(DARK_TOPICS_POLICY));
assert("dark policy requires direct acknowledgment", /без смягчений/.test(DARK_TOPICS_POLICY));
assert(
  "dark policy requires honest verdict first",
  /ЧЕСТНЫЙ ВЕРДИКТ/.test(DARK_TOPICS_POLICY) && /Плохо по картам — говори плохо/.test(DARK_TOPICS_POLICY)
);
assert(
  "dark policy bans sugar endings",
  /рассвет близко/.test(DARK_TOPICS_POLICY) && /[Оо]бязательная надежда/.test(DARK_TOPICS_POLICY)
);
assert("card-grounded names shadow directly", /называй прямо/.test(CARD_GROUNDED_READING_RULES));
assert("card-grounded requires verdict", /Вердикт по доминирующим/.test(CARD_GROUNDED_READING_RULES));
assert("premium extras: no forbidden topics", /Нет запретных тем расклада/.test(extras));
assert("premium extras: name pain/break/cold", /разрыв, холод, риск, боль/.test(extras));
assert("premium extras: verdict-first honesty", /Сначала вердикт/.test(extras));
assert(
  "default extras are honesty-only (no depth duplicate)",
  !/КАК ПИСАТЬ РАЗБОР/.test(extras) && !/оплаченный тематический расклад/.test(extras)
);
const extrasFull = buildPaidSpreadReadingExtras({
  cardCount: 3,
  masterId: "ragnar",
  includeDepthBlocks: true,
});
assert(
  "depth extras still available when requested",
  /КАК ПИСАТЬ РАЗБОР/.test(extrasFull) && /оплаченный тематический расклад/.test(extrasFull)
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

// Light spread: verdict honesty without inventing death/curse
const lightReading = buildCharacterPrompt(
  "veronika",
  {
    userName: "Юлия",
    gender: "Женский",
    zodiac: "Дева",
    birthDate: "01.09.1990",
    today: "28 июля 2026",
    isPaid: true,
    tarotCards: [
      { name: "Солнце", meaning: "успех, ясность, радость" },
      { name: "Колесо Фортуны", meaning: "поворот судьбы, новый цикл" },
      { name: "Звезда", meaning: "надежда, исцеление, ориентир" },
    ],
    mainQuestion: "Стоит ли соглашаться на новую работу?",
  },
  {
    intention: "money",
    forceThematicReading: true,
    lastUserMessage: "Стоит ли соглашаться на новую работу?",
  }
);
const lightWrapped = await wrapSystemPrompt(
  `${lightReading}\n\n${buildPaidSpreadReadingExtras({ cardCount: 3, masterId: "veronika" })}`
);
assert("light reading still has verdict policy", /ЧЕСТНЫЙ ВЕРДИКТ|Вердикт по доминирующим/.test(lightWrapped));
assert("light reading forbids inventing death on bright cards", /не эскалируй|Солнце\/Колесо ≠ смерть/i.test(lightWrapped));
assert("light reading keeps position canon note", /Метки позиций выше — единственный канон/.test(lightWrapped));
assert(
  "bare money question does not force money_loss topic",
  !detectTopics("Стоит ли соглашаться на новую работу с хорошей зарплатой?").includes("money_loss")
);
assert(
  "real money crisis still detects money_loss",
  detectTopics("долги и крах, денег нет").includes("money_loss")
);

console.log(`\n--- ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
