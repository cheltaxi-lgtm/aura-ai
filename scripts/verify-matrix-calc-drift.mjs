/**
 * Guard site destinyMatrix (matrix-v2) vs bot local diagram fallback.
 * Covers every diagram slot, arcana names and the accepted birth-date set, with a
 * frozen calendar anchor so the run cannot flip across a year/month boundary.
 * Usage: npx tsx scripts/verify-matrix-calc-drift.mjs
 */
import {
  DESTINY_MATRIX_DIAGRAM_SLOTS,
  MATRIX_CALCULATION_VERSION,
  destinyMatrix,
} from "../src/lib/numerology/destiny-matrix.ts";
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

const AS_OF = "2026-08-03";
const [asOfYear, asOfMonth] = AS_OF.split("-").map(Number);

const fixtures = [
  "1979-09-18",
  "1990-05-15",
  "2001-01-01",
  "1995-03-14",
  "1988-12-31",
  "1948-02-29",
  "1964-11-23",
  "2010-06-25",
];

/** One side must never render a date the other rejects. */
const parseProbes = [
  "1988-2-3",
  "1988-02-03",
  "3.2.1988",
  "03/02/1988",
  " 1988-02-03 ",
  "2001-02-30",
  "2001-13-01",
  "2001-13-45",
  "1899-12-31",
  "2101-01-01",
  "0001-01-01",
  "1988-00-00",
  "1988-02-03T10:00:00Z",
  "not-a-date",
  "",
];

let failed = 0;

for (const birth of fixtures) {
  const site = destinyMatrix(birth, {
    asOfYear,
    asOfMonth,
    asOfDate: AS_OF,
  });
  const bot = buildLocalMatrixDiagram(birth, "Audit", { asOfDate: AS_OF });
  if (!site || !bot) {
    console.error("FAIL: null matrix", birth, { site: Boolean(site), bot: Boolean(bot) });
    failed += 1;
    continue;
  }
  if (bot.slots.length !== DESTINY_MATRIX_DIAGRAM_SLOTS.length) {
    console.error("FAIL slot count", {
      birth,
      site: DESTINY_MATRIX_DIAGRAM_SLOTS.length,
      bot: bot.slots.length,
    });
    failed += 1;
  }
  for (const slot of DESTINY_MATRIX_DIAGRAM_SLOTS) {
    const sitePoint = slot.pick(site);
    const botSlot = bot.slots.find((s) => s.key === slot.key);
    if (!botSlot) {
      console.error("FAIL missing slot", { birth, key: slot.key });
      failed += 1;
      continue;
    }
    if (botSlot.number !== sitePoint.number) {
      console.error("FAIL number drift", {
        birth,
        key: slot.key,
        site: sitePoint.number,
        bot: botSlot.number,
      });
      failed += 1;
    }
    if (botSlot.arcanaName !== sitePoint.arcanaName) {
      console.error("FAIL arcana name drift", {
        birth,
        key: slot.key,
        site: sitePoint.arcanaName,
        bot: botSlot.arcanaName,
      });
      failed += 1;
    }
    if (botSlot.area !== slot.area) {
      console.error("FAIL area drift", { birth, key: slot.key, site: slot.area, bot: botSlot.area });
      failed += 1;
    }
  }
  if (bot.focusKey !== site.focusKey) {
    console.error("FAIL focusKey drift", { birth, bot: bot.focusKey, site: site.focusKey });
    failed += 1;
  }
}

for (const probe of parseProbes) {
  const siteAccepts = Boolean(destinyMatrix(probe, { asOfDate: AS_OF }));
  const botAccepts = Boolean(buildLocalMatrixDiagram(probe, "Audit", { asOfDate: AS_OF }));
  if (siteAccepts !== botAccepts) {
    console.error("FAIL birth-date parsing drift", { probe, siteAccepts, botAccepts });
    failed += 1;
  }
}

if (failed) {
  console.error(`FAIL verify-matrix-calc-drift (${failed} mismatches)`);
  process.exit(1);
}
console.log(
  `OK verify-matrix-calc-drift (${fixtures.length} fixtures x ${DESTINY_MATRIX_DIAGRAM_SLOTS.length} slots, ` +
    `${parseProbes.length} parse probes, version=${MATRIX_CALCULATION_VERSION})`
);
