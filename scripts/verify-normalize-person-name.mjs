#!/usr/bin/env node
import {
  displayNameNeedsNormalization,
  normalizePersonDisplayName,
  normalizeStoredDisplayName,
} from "../src/lib/normalize-person-name.ts";

const cases = [
  ["Gennady Kharitonov", "Геннадий"],
  ["gennadiy", "Геннадий"],
  ["Гennadiy", "Геннадий"],
  ["Гennady", "Геннадий"],
  ["Alexander Pushkin", "Александр"],
  ["maria", "Мария"],
  ["Анна Иванова", "Анна"],
  ["yulia.smirnova@mail.ru", "Юлия"],
  ["", ""],
  ["Dmitry", "Дмитрий"],
  ["Олег", "Олег"],
];

let failed = 0;
for (const [input, expected] of cases) {
  const actual = normalizePersonDisplayName(input);
  if (actual !== expected) {
    console.error(`FAIL: ${JSON.stringify(input)} => ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
    failed += 1;
  }
}

const storedCases = [
  ["Gennadiy Kharitonov", "Геннадий"],
  ["Гennadiy", "Геннадий"],
  ["", "Гость"],
  ["Олег", "Олег"],
];
for (const [input, expected] of storedCases) {
  const actual = normalizeStoredDisplayName(input);
  if (actual !== expected) {
    console.error(
      `FAIL stored: ${JSON.stringify(input)} => ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`
    );
    failed += 1;
  }
}

if (!displayNameNeedsNormalization("Gennadiy")) {
  console.error("FAIL: Gennadiy should need normalization");
  failed += 1;
}
if (displayNameNeedsNormalization("Геннадий")) {
  console.error("FAIL: Геннадий should not need normalization");
  failed += 1;
}

if (failed) {
  process.exit(1);
}
console.log(`verify-normalize-person-name OK (${cases.length + storedCases.length} cases)`);
