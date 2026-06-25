#!/usr/bin/env node
/**
 * Topic-handler smoke tests — run: npx tsx scripts/test-numerology-topics.mjs
 */
import {
  buildNumerologyChatContext,
  detectNumerologyTopics,
} from "../src/lib/numerology/topic-handlers.ts";

const BIRTH = "1990-03-15";
const NAME = "Анна Иванова";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
    return;
  }
  console.log("OK:", msg);
}

const CASES = [
  {
    label: "1. Личный год/месяц/день",
    message: "Какой у меня личный год и что ждёт сегодня?",
    topic: "personal_cycle",
    promptNeedle: "РАСЧЁТ ЛИЧНОГО ЦИКЛА",
  },
  {
    label: "2. Карма",
    message: "Есть ли у меня кармический долг или урок?",
    topic: "karma",
    promptNeedle: "КАРМИЧЕСКИЙ БЛОК",
  },
  {
    label: "3. Квадрат Пифагора",
    message: "Покажи мой квадрат Пифагора и психоматрицу",
    topic: "pythagoras_square",
    promptNeedle: "КВАДРАТ ПИФАГОРА",
    hasUi: true,
  },
  {
    label: "4. Прогноз 9 лет",
    message: "Прогноз на годы — мои циклы на 9 лет",
    topic: "forecast_timeline",
    promptNeedle: "ПРОГНОЗ ЛИЧНЫХ ГОДОВ",
  },
  {
    label: "5. Благоприятные даты",
    message: "Когда лучше подписать договор — удачный день в этом месяце",
    topic: "favorable_dates",
    promptNeedle: "БЛАГОПРИЯТНЫЕ ДАТЫ",
  },
  {
    label: "6. Число телефона",
    message: "Число телефона +79991234567",
    topic: "object_number",
    promptNeedle: "Число телефона",
  },
  {
    label: "7. Совместимость",
    message: "Совместимость: я и Борис, он 22.07.1988",
    topic: "compatibility",
    promptNeedle: "РАСЧЁТ СОВМЕСТИМОСТИ",
  },
  {
    label: "8. Халдейская система",
    message: "Посчитай по халдейской системе мои числа имени",
    topic: "chaldean",
    promptNeedle: "ХАЛДЕЙСКАЯ СИСТЕМА",
  },
];

console.log("=== Topic detection + prompt injection ===\n");

for (const c of CASES) {
  const topics = detectNumerologyTopics(c.message);
  assert(topics.includes(c.topic), `${c.label}: topic ${c.topic} detected in [${topics.join(", ")}]`);

  const ctx = buildNumerologyChatContext({
    birthDate: BIRTH,
    profileName: NAME,
    lastUserMessage: c.message,
  });

  assert(
    ctx.prompt.includes("НУМЕРОЛОГИЧЕСКИЙ БАЗОВЫЙ ПОРТРЕТ"),
    `${c.label}: base fullProfile in prompt`
  );
  assert(ctx.prompt.includes(c.promptNeedle), `${c.label}: block «${c.promptNeedle}» in prompt`);
  assert(
    ctx.prompt.includes("АНТИ-ГАЛЛЮЦИНАЦИЯ"),
    `${c.label}: anti-hallucination rule in prompt`
  );

  if (c.hasUi) {
    assert(Boolean(ctx.ui?.pythagorasSquare), `${c.label}: pythagorasSquare UI payload`);
  }

  console.log(`  → prompt excerpt: ...${ctx.prompt.slice(ctx.prompt.indexOf(c.promptNeedle), ctx.prompt.indexOf(c.promptNeedle) + 80)}...\n`);
}

const noTopic = buildNumerologyChatContext({
  birthDate: BIRTH,
  profileName: NAME,
  lastUserMessage: "Привет, расскажи о себе",
});
assert(
  !noTopic.prompt.includes("РАСЧЁТ ЛИЧНОГО ЦИКЛА") &&
    !noTopic.prompt.includes("КВАДРАТ ПИФАГОРА"),
  "No topic: only base portrait, no extra blocks"
);
assert(
  noTopic.prompt.includes("ПОДСКАЗКА МАСТЕРУ"),
  "No topic: master hint to offer calculations"
);

if (process.exitCode) {
  console.error("\nSome topic tests failed.");
  process.exit(1);
}
console.log("\nAll 8 topic-handler tests passed.");
