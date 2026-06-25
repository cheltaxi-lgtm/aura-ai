#!/usr/bin/env node
/**
 * Smoke tests for numerology engine — run: npx tsx scripts/test-numerology.mjs
 */
import {
  lifePathNumber,
  destinyNumber,
  numberOfString,
  reduceToSingle,
} from "../src/lib/numerology/calculator.ts";
import { parseBirthDate } from "../src/lib/numerology/constants.ts";
import { pythagorasSquare } from "../src/lib/numerology/pythagoras-square.ts";
import { personalYearForecast } from "../src/lib/numerology/forecast.ts";
import { compatibility } from "../src/lib/numerology/compatibility.ts";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
    return;
  }
  console.log("OK:", msg);
}

const lp = lifePathNumber("1990-03-15");
assert(lp.number === 1, `lifePathNumber("1990-03-15") = ${lp.number}, expected 1`);

const master = lifePathNumber("1993-03-17");
assert(master.number === 33 && master.isMaster, `master life path = ${master.number}, isMaster=${master.isMaster}`);

assert(reduceToSingle(11, true) === 11, "11 not reduced with keepMaster");
assert(reduceToSingle(22, true) === 22, "22 not reduced");
assert(reduceToSingle(33, true) === 33, "33 not reduced");

assert(parseBirthDate("29.02.2000") !== null, "29.02.2000 accepted (leap year)");
assert(parseBirthDate("29.02.2001") === null, "29.02.2001 rejected (non-leap year)");
assert(parseBirthDate("31.04.2000") === null, "31.04.2000 rejected (invalid calendar date)");
assert(parseBirthDate("32.13.1995") === null, "32.13.1995 rejected (out of range)");

const destRu = destinyNumber("Иван Петров");
assert(destRu.number > 0, `Cyrillic destiny = ${destRu.number}`);

const destCh = destinyNumber("Иван", "chaldean");
assert(destCh.number > 0, `Chaldean destiny = ${destCh.number}`);

const square = pythagorasSquare("1990-03-15");
assert(square !== null, "pythagorasSquare not null");
const cellSum = Object.values(square.cells).reduce((a, b) => a + b, 0);
assert(cellSum > 0, `pythagorasSquare cells filled, sum=${cellSum}`);

const forecast = personalYearForecast("1990-03-15", 2026, 9);
assert(forecast.length === 9, `forecast length = ${forecast.length}`);

const compat = compatibility("1990-03-15", "Анна", "1988-07-22", "Борис");
assert(compat.score >= 0 && compat.score <= 100, `compatibility score = ${compat.score}`);

const phone = numberOfString("+79991234567");
assert(phone.number > 0, `phone number = ${phone.number}`);

console.log("\n--- Sample outputs ---");
console.log("Life path 1990-03-15:", lp.number, lp.title);
console.log("Master 1993-03-17:", master.number);
console.log("Square cells:", square.cells);
console.log("Forecast[0]:", forecast[0]);
console.log("Compat score:", compat.score);
console.log("Phone:", phone.number);

if (process.exitCode) {
  console.error("\nSome tests failed.");
  process.exit(1);
}
console.log("\nAll numerology tests passed.");
