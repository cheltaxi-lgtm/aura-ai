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
}

if (failures.length) {
  console.error("verify-destiny-matrix FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(`verify-destiny-matrix OK (${FIXTURES.length} fixtures, dictionary 22, isolation)`);
