#!/usr/bin/env node
/**
 * Verify chip preset messages trigger numerology topic-handlers.
 * Run: npx tsx scripts/test-numerolog-chips.mjs
 */
import { detectNumerologyTopics } from "../src/lib/numerology/topic-handlers.ts";

const CHIPS = [
  { label: "Квадрат Пифагора", message: "Разбери мой квадрат Пифагора", topic: "pythagoras_square" },
  { label: "Мой личный год", message: "Что меня ждёт в этом году?", topic: "personal_cycle" },
  { label: "Прогноз 9 лет", message: "Покажи мой прогноз на 9 лет", topic: "forecast_timeline" },
  { label: "Удачные даты", message: "Какие благоприятные даты для меня?", topic: "favorable_dates" },
  { label: "Кармические уроки", message: "Разбери мою карму", topic: "karma" },
  {
    label: "Халдейская",
    message: "Посчитай мои числа имени по халдейской системе",
    topic: "chaldean",
  },
  {
    label: "Совместимость (form)",
    message: "Совместимость с Борис, дата рождения 22.07.1988",
    topic: "compatibility",
  },
  {
    label: "Число телефона (form)",
    message: "Число телефона +79991234567",
    topic: "object_number",
  },
];

let failed = 0;
for (const chip of CHIPS) {
  const topics = detectNumerologyTopics(chip.message);
  const ok = topics.includes(chip.topic);
  console.log(`${ok ? "OK" : "FAIL"}: [${chip.label}] → ${chip.topic} in [${topics.join(", ")}]`);
  if (!ok) failed++;
}

if (failed) {
  console.error(`\n${failed} chip(s) failed topic detection.`);
  process.exit(1);
}
console.log("\nAll chip messages trigger expected topics.");
