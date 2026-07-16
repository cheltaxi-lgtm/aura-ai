#!/usr/bin/env node
import { normalizePersonDisplayName } from "../src/lib/normalize-person-name.ts";

const cases = [
  ["Gennady Kharitonov", "Геннадий"],
  ["gennadiy", "Геннадий"],
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

if (failed) {
  process.exit(1);
}
console.log(`verify-normalize-person-name OK (${cases.length} cases)`);
