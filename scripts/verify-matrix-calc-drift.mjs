/**
 * Guard site destinyMatrix (matrix-v2) vs bot local diagram fallback numbers.
 * Usage: npx tsx scripts/verify-matrix-calc-drift.mjs
 */
import { destinyMatrix, MATRIX_CALCULATION_VERSION } from "../src/lib/numerology/destiny-matrix.ts";
import {
  BOT_MATRIX_CALC_VERSION,
  buildLocalMatrixDiagram,
} from "../telegram-bot/src/domain/matrix/calc.ts";

if (MATRIX_CALCULATION_VERSION !== BOT_MATRIX_CALC_VERSION) {
  console.error("FAIL: version mismatch", {
    site: MATRIX_CALCULATION_VERSION,
    bot: BOT_MATRIX_CALC_VERSION,
  });
  process.exit(1);
}

const fixtures = [
  "1979-09-18",
  "1990-05-15",
  "2001-01-01",
  "1995-03-14",
  "1988-12-31",
];

const keyMap = [
  ["body", "body"],
  ["money", "money"],
  ["relationships", "relationships"],
  ["purpose", "purpose"], // comfort center
  ["karma", "karmicTail0"],
  ["yearArcana", "yearArcana"],
  ["monthArcana", "monthArcana"],
];

let failed = 0;
for (const birth of fixtures) {
  const site = destinyMatrix(birth);
  const bot = buildLocalMatrixDiagram(birth, "Audit");
  if (!site || !bot) {
    console.error("FAIL: null matrix", birth, { site: Boolean(site), bot: Boolean(bot) });
    failed += 1;
    continue;
  }
  const siteNums = {
    body: site.body.number,
    money: site.money.number,
    relationships: site.relationships.number,
    purpose: site.purpose.number,
    karmicTail0: site.karmicTail[0].number,
    yearArcana: site.yearArcana.number,
    monthArcana: site.monthArcana.number,
  };
  for (const [botKey, siteKey] of keyMap) {
    const slot = bot.slots.find((s) => s.key === botKey);
    const botN = slot?.number;
    const siteN = siteNums[siteKey];
    if (botN !== siteN) {
      console.error("FAIL drift", { birth, botKey, siteKey, botN, siteN });
      failed += 1;
    }
  }
  if (bot.focusKey !== site.focusKey) {
    console.error("FAIL focusKey drift", {
      birth,
      bot: bot.focusKey,
      site: site.focusKey,
    });
    failed += 1;
  }
  if (bot.slots.length !== 16) {
    console.error("FAIL slot count", { birth, slots: bot.slots.length });
    failed += 1;
  }
}

if (failed) {
  console.error(`FAIL verify-matrix-calc-drift (${failed} mismatches)`);
  process.exit(1);
}
console.log(
  `OK verify-matrix-calc-drift (${fixtures.length} fixtures, version=${MATRIX_CALCULATION_VERSION})`
);
