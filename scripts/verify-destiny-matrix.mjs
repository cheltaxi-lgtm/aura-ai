#!/usr/bin/env node
/**
 * Destiny matrix engine + dictionary smoke tests (no DB).
 * Run: npm run verify:destiny-matrix
 */
import {
  ARCANA_DICTIONARY,
  getArcanaEntry,
} from "../src/lib/numerology/arcana-dictionary.ts";
import {
  DESTINY_MATRIX_POINT_KEYS,
  MATRIX_CALCULATION_VERSION,
  destinyMatrix,
  reduceToArcanaNumber,
} from "../src/lib/numerology/destiny-matrix.ts";
import { buildMatrixFreeSummary } from "../src/lib/numerology/matrix-free-summary.ts";
import { buildRichEngineFacts } from "../src/lib/numerology/engine-reply.ts";
import { buildNumerologyChatContext } from "../src/lib/numerology/topic-handlers.ts";
import {
  buildMatrixPlainFinale,
  formatMatrixFinaleKeys,
  formatMatrixPointDictLine,
  formatMatrixRepeatArcanaNote,
  matrixRoleLens,
} from "../src/lib/numerology/matrix-point-prompt.ts";
import {
  breakNumberedSteps,
  formatDestinyMatrixReadingForDisplay,
  looksLikeDestinyMatrixReading,
} from "../src/lib/numerology/format-matrix-reading-display.ts";
import { formatPremiumReadingForDisplay } from "../src/lib/format-premium-reading.ts";
import {
  genderLabelOrUndefined,
  inferGenderFromFirstName,
  normalizeUserGender,
  resolveClientGender,
} from "../src/lib/russian-name-gender.ts";
import { buildGenderPronounBlock } from "../src/lib/prompts/gender-context.ts";
import { buildRitualPrompt } from "../src/lib/ritual-prompt.ts";
import { computeRitualSchedule } from "../src/lib/ritual-timing.ts";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const FIXTURES = [
  {
    date: "1995-03-14",
    asOfYear: 2026,
    expect: {
      body: 14,
      energy: 3,
      roots: 6,
      purpose: 5,
      relationships: 19,
      money: 8,
      karma: 11,
      talents: 17,
      paternal: 20,
      maternal: 9,
      yearArcana: 9,
    },
  },
  {
    date: "2000-01-01",
    asOfYear: 2026,
    expect: {
      body: 1,
      energy: 1,
      roots: 2,
      purpose: 4,
      relationships: 5,
      money: 5,
      karma: 6,
      talents: 2,
      paternal: 3,
      maternal: 3,
      yearArcana: 12,
    },
  },
  {
    date: "1988-12-31",
    asOfYear: 2026,
    expect: {
      body: 4,
      energy: 12,
      roots: 8,
      purpose: 6,
      relationships: 10,
      money: 18,
      karma: 14,
      talents: 16,
      paternal: 12,
      maternal: 20,
      yearArcana: 8,
    },
  },
  {
    date: "1975-07-07",
    asOfYear: 2026,
    expect: {
      body: 7,
      energy: 7,
      roots: 22,
      purpose: 9,
      relationships: 16,
      money: 16,
      karma: 4,
      talents: 14,
      paternal: 11,
      maternal: 11,
      yearArcana: 6,
    },
  },
  {
    date: "2010-06-15",
    asOfYear: 2026,
    expect: {
      body: 15,
      energy: 6,
      roots: 3,
      purpose: 6,
      relationships: 21,
      money: 12,
      karma: 9,
      talents: 21,
      paternal: 18,
      maternal: 9,
      yearArcana: 4,
    },
  },
  {
    date: "1964-11-22",
    asOfYear: 2026,
    expect: {
      body: 22,
      energy: 11,
      roots: 20,
      purpose: 8,
      relationships: 3,
      money: 19,
      karma: 10,
      talents: 6,
      paternal: 6,
      maternal: 4,
      yearArcana: 7,
    },
  },
  {
    date: "1999-09-09",
    asOfYear: 2026,
    expect: {
      body: 9,
      energy: 9,
      roots: 10,
      purpose: 10,
      relationships: 19,
      money: 19,
      karma: 20,
      talents: 18,
      paternal: 19,
      maternal: 19,
      yearArcana: 10,
    },
  },
  {
    date: "1980-02-29",
    asOfYear: 2026,
    expect: {
      body: 11,
      energy: 2,
      roots: 18,
      purpose: 4,
      relationships: 15,
      money: 6,
      karma: 22,
      talents: 13,
      paternal: 11,
      maternal: 20,
      yearArcana: 5,
    },
  },
];

assert(MATRIX_CALCULATION_VERSION === "matrix-v1", "version must be matrix-v1");
assert(DESTINY_MATRIX_POINT_KEYS.length === 11, "expected 11 matrix-v1 point keys");

for (const [n, expected] of [
  [0, 22],
  [22, 22],
  [23, 5],
  [45, 9],
  [99, 18],
]) {
  assert(reduceToArcanaNumber(n) === expected, `reduceToArcanaNumber(${n}) => ${expected}`);
}

assert(ARCANA_DICTIONARY.length === 22, "dictionary must have 22 entries");
for (let id = 1; id <= 22; id++) {
  const entry = getArcanaEntry(id);
  assert(!!entry, `missing dictionary entry ${id}`);
  assert(entry?.title?.length > 0, `entry ${id} needs title`);
  assert(entry?.light?.length > 0 && entry?.shadow?.length > 0, `entry ${id} needs light/shadow`);
  assert(entry?.money?.length > 0 && entry?.love?.length > 0, `entry ${id} needs money/love`);
}

assert(destinyMatrix("") === null, "empty date => null");
assert(destinyMatrix("not-a-date") === null, "invalid date => null");

for (const fixture of FIXTURES) {
  const matrix = destinyMatrix(fixture.date, { asOfYear: fixture.asOfYear });
  assert(!!matrix, `${fixture.date}: matrix computed`);
  if (!matrix) continue;
  for (const key of DESTINY_MATRIX_POINT_KEYS) {
    const actual = matrix[key]?.number;
    const expected = fixture.expect[key];
    assert(
      actual === expected,
      `${fixture.date}.${key}: expected ${expected}, got ${actual}`
    );
    assert(actual >= 1 && actual <= 22, `${fixture.date}.${key} out of 1–22`);
    assert(matrix[key].arcanaName.length > 0, `${fixture.date}.${key} missing name`);
  }

  const summary = buildMatrixFreeSummary(fixture.date, {
    asOfYear: fixture.asOfYear,
    name: "Тест",
  });
  assert(!!summary, `${fixture.date}: free summary`);
  assert(summary?.keyArcana?.length === 3, `${fixture.date}: 3 key arcana`);
  assert(summary?.portrait?.includes("Тест"), `${fixture.date}: portrait uses name`);
}

// Prompt isolation: full matrix session must not leak Pythagorean LP/soul into engine facts.
{
  const ctx = buildNumerologyChatContext({
    birthDate: "1995-03-14",
    profileName: "Геннадий Тестов",
    lastUserMessage: "Построй мою матрицу судьбы",
  });
  assert(ctx.topics.includes("destiny_matrix"), "matrix topic detected");
  assert(
    !/НУМЕРОЛОГИЧЕСКИЙ БАЗОВЫЙ ПОРТРЕТ/i.test(ctx.prompt),
    "matrix-only context must not include base Pythagorean portrait"
  );
  assert(
    !/ЧИСЛО ЖИЗНЕННОГО ПУТИ \(реальный/i.test(ctx.prompt),
    "matrix-only context must not include life path block"
  );
  assert(/МАТРИЦА СУДЬБЫ/i.test(ctx.prompt), "matrix block present");
  assert(/ЗАПРЕТ СМЕШЕНИЯ/i.test(ctx.prompt), "mix ban present");
  assert(
    !/Имя для обращения: Построй/i.test(ctx.prompt),
    "matrix CTA text must not become client name"
  );

  const facts = buildRichEngineFacts({
    prompt: ctx.prompt,
    primaryTopic: "destiny_matrix",
    userMessage: "Построй мою матрицу судьбы",
  });
  assert(/МАТРИЦА СУДЬБЫ/i.test(facts), "rich facts include matrix");
  assert(
    !/НУМЕРОЛОГИЧЕСКИЙ БАЗОВЫЙ ПОРТРЕТ/i.test(facts),
    "rich facts exclude base portrait"
  );
  assert(!/КВАДРАТ ПИФАГОРА/i.test(facts), "rich facts exclude Pythagoras");
  assert(/нельзя объединять/i.test(facts), "anti-collapse rule in facts");

  // Same birth as the watery sample (energy=talents=9, roots=purpose=relationships=8).
  const gennady = destinyMatrix("1979-09-18", { asOfYear: 2026 });
  assert(!!gennady, "1979-09-18 matrix");
  assert(gennady?.body.number === 18, "1979-09-18 body=18 Moon");
  assert(gennady?.energy.number === 9 && gennady?.talents.number === 9, "energy/talents both 9");
  assert(
    gennady?.roots.number === 8 &&
      gennady?.purpose.number === 8 &&
      gennady?.relationships.number === 8,
    "roots/purpose/relationships all 8 — must stay separate in prose"
  );
  assert(gennady?.money.number === 17, "1979-09-18 money=17 Star");
  assert(gennady?.yearArcana.number === 10, "1979-09-18 year=10 Wheel");

  const strength = getArcanaEntry(8);
  assert(!!strength, "arcana 8 entry");
  const rootsLens = matrixRoleLens("roots", strength);
  const purposeLens = matrixRoleLens("purpose", strength);
  const loveLens = matrixRoleLens("love", strength);
  const paternalLens = matrixRoleLens("paternal", strength);
  assert(rootsLens !== purposeLens, "role lenses differ roots vs purpose");
  assert(purposeLens !== loveLens, "role lenses differ purpose vs love");
  assert(loveLens !== paternalLens, "role lenses differ love vs paternal");
  assert(!/Совет: Назовите чувство/i.test(rootsLens), "roots lens must not paste generic advice");

  const gCtx = buildNumerologyChatContext({
    birthDate: "1979-09-18",
    profileName: "Геннадий",
    lastUserMessage: "Построй мою матрицу судьбы",
  });
  assert(/ПОВТОРЫ АРКАНОВ/i.test(gCtx.prompt), "repeat-arcana note for Gennady");
  assert(/Угол рода\/корней/i.test(gCtx.prompt), "role lens in prompt");
  assert(
    (gCtx.prompt.match(/Назовите чувство вслух/g) || []).length <= 1,
    "generic Strength advice must not spam every Strength point"
  );

  const lineA = formatMatrixPointDictLine(
    { role: "roots", label: "3. Точка рода", number: 8 },
    strength
  );
  const lineB = formatMatrixPointDictLine(
    { role: "purpose", label: "4. Ось", number: 8 },
    strength
  );
  assert(lineA !== lineB, "formatted point lines differ by role");
  const note = formatMatrixRepeatArcanaNote([
    { role: "roots", label: "3. Род", number: 8 },
    { role: "purpose", label: "4. Центр", number: 8 },
  ]);
  assert(!!note && /8 →/i.test(note), "repeat note lists arcana 8");

  const keys = formatMatrixFinaleKeys(gennady);
  assert(/Аркан года: 10 — Колесо/i.test(keys), "keys lock year to Wheel");
  assert(!/Аркан года: 9/i.test(keys), "keys must not set year to Hermit");

  const plain = buildMatrixPlainFinale("Геннадий", gennady);
  assert(/Аркан этого года — Колесо Фортуны \(10\)/i.test(plain), "plain finale year=10");
  assert(!/аркан этого года — Отшельник/i.test(plain), "plain finale must not call year Hermit");
  assert(/Предназначение — Сила \(8\)/i.test(plain), "plain finale purpose=8");
  assert(/Деньги — через Звезда/i.test(plain), "plain finale money=Star");
  assert(plain.includes("\n"), "plain finale uses line breaks");

  const wall = [
    "Геннадий, вот твой разбор матрицы судьбы по 22 арканам. Точка тела и характера (18 — Луна)",
    "Ты чувствителен к настроениям. Практика: записывай сны. Точка энергии (9 — Отшельник)",
    "Ты восстанавливаешься в тишине.",
    "Шаги на 30 дней:",
    "1) Записывай сны 7 дней. 2) День уединения раз в неделю. 3) Честный разговор.",
    "Простыми словами:",
    plain.replace(/\n/g, " "),
  ].join(" ");
  assert(looksLikeDestinyMatrixReading(wall), "detect matrix wall-of-text");
  const pretty = formatDestinyMatrixReadingForDisplay(wall);
  assert(/^### Точка тела и характера/m.test(pretty), "matrix point becomes h3");
  assert(/^## Шаги на 30 дней/m.test(pretty), "steps section becomes h2");
  assert(/^## Простыми словами/m.test(pretty), "finale section becomes h2");
  assert(/^1\.\s/m.test(pretty) && /^2\.\s/m.test(pretty) && /^3\.\s/m.test(pretty), "numbered steps on own lines");
  assert(
    breakNumberedSteps("Сделай так. 1) Первый шаг 2) Второй шаг").includes("\n1. "),
    "breakNumberedSteps splits glued 1) 2)"
  );

  const tarotWall =
    "Карты говорят о выборе. **Маг** открывает путь. Простыми словами: действуй мягко. 1) Сделай шаг 2) Не торопись";
  const tarotPretty = formatPremiumReadingForDisplay(tarotWall);
  assert(/^## Простыми словами/m.test(tarotPretty), "general formatter promotes Простыми словами");
  assert(/^1\.\s/m.test(tarotPretty) && /^2\.\s/m.test(tarotPretty), "general formatter splits numbered steps");

  // Must not treat «Деньги» as daily header «День».
  const moneyLine = formatPremiumReadingForDisplay(
    "Ввод. Деньги идут через партнёрство. Простыми словами: держи фокус."
  );
  assert(!/^### День\b/m.test(moneyLine), "must not split Деньги into ### День");
  assert(/^## Простыми словами/m.test(moneyLine), "still promotes Простыми словами after Деньги");

  // Already-markdown tarot should keep a single ## Простыми словами.
  const mdTarot = formatPremiumReadingForDisplay(
    "Ввод.\n\n**Маг** — путь.\n\n## Простыми словами\n\nДействуй мягко."
  );
  assert(
    (mdTarot.match(/^## Простыми словами/gm) || []).length === 1,
    "must not double-promote existing ## Простыми словами"
  );

  assert(normalizeUserGender("female") === "female", "normalize female");
  assert(normalizeUserGender("male") === "male", "normalize male");
  assert(normalizeUserGender("Женский") === "female", "normalize Женский");
  assert(inferGenderFromFirstName("Юлия") === "female", "Юлия → female");
  assert(inferGenderFromFirstName("Юлий") === "male", "Юлий → male");
  assert(inferGenderFromFirstName("Никита") === "male", "Никита → male");
  assert(inferGenderFromFirstName("Саша") === null, "Саша unisex → null");
  assert(inferGenderFromFirstName("Женя") === null, "Женя unisex → null");
  assert(resolveClientGender(null, "Юлия") === "female", "resolve Юлия without profile");
  assert(resolveClientGender("male", "Юлия") === "male", "profile gender wins over name");
  assert(genderLabelOrUndefined(null) === undefined, "label: missing → undefined (not female)");
  assert(genderLabelOrUndefined("male") === "Мужской", "label: male");
  assert(genderLabelOrUndefined("female") === "Женский", "label: female");

  const genderBlock = buildGenderPronounBlock({
    name: "Юлия",
    gender: "female",
    zodiac: "",
    birthDate: "",
    cards: [],
  });
  assert(/ЖЕНЩИНА/i.test(genderBlock), "gender pronoun block marks woman");
  assert(/Юлия≠Юлий|именительном/i.test(genderBlock), "gender block locks nominative name");

  const juliaCtx = buildNumerologyChatContext({
    birthDate: "1990-05-01",
    profileName: "Юлия",
    gender: "female",
    lastUserMessage: "Построй мою матрицу судьбы",
  });
  assert(/женщина/i.test(juliaCtx.prompt), "matrix context includes female gender");
  assert(/Юлия/i.test(juliaCtx.prompt), "matrix context keeps Юлия");
  assert(!/пол клиента не указан/i.test(juliaCtx.prompt), "matrix context must not drop gender");

  const ritualPrompt = buildRitualPrompt({
    characterKey: "agafya",
    ritualType: "love",
    userName: "Юлия",
    userZodiac: "Весы",
    userGender: "female",
    answers: ["ответ"],
    cards: [{ name: "Шут", position: "1", meaning: "начало" }],
    moonPhase: "растущая",
    moonSign: "Овен",
    schedule: computeRitualSchedule("love", new Date("2026-07-20T12:00:00Z")),
  });
  assert(/ЖЕНЩИНА/i.test(ritualPrompt), "ritual prompt includes female gender lock");
  assert(/Юлия/i.test(ritualPrompt), "ritual prompt keeps name");
}

if (failures.length) {
  console.error("verify-destiny-matrix FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(`verify-destiny-matrix OK (${FIXTURES.length} fixtures, dictionary 22, isolation)`);
