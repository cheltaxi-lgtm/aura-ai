#!/usr/bin/env node
/**
 * Brute-force invariant audit for the destiny matrix engine.
 * Run: npm run verify:destiny-matrix-invariants (part of `npm test`).
 */
import {
  DESTINY_MATRIX_DIAGRAM_SLOTS,
  DESTINY_MATRIX_POINT_KEYS,
  arcanaForNumber,
  destinyMatrix,
  reduceToArcanaNumber,
} from "../src/lib/numerology/destiny-matrix.ts";

const problems = [];
function note(kind, detail) {
  problems.push(`${kind}: ${detail}`);
}

// 1. Range invariant across every valid date 1900..2100.
let dates = 0;
let outOfRange = 0;
const focusHistogram = new Map();
const ageClamp = new Map();
for (let year = 1900; year <= 2100; year++) {
  for (let month = 1; month <= 12; month++) {
    const dim = new Date(year, month, 0).getDate();
    for (let day = 1; day <= dim; day++) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const m = destinyMatrix(iso, { asOfYear: 2026, asOfMonth: 8, asOfDate: "2026-08-03" });
      if (!m) {
        note("NULL_MATRIX", iso);
        continue;
      }
      dates++;
      const all = [
        ...DESTINY_MATRIX_POINT_KEYS.map((k) => [k, m[k].number]),
        ["skySpirit", m.skySpirit.number],
        ["earthTask", m.earthTask.number],
        ["monthArcana", m.monthArcana.number],
        ...m.karmicTail.map((p, i) => [`karmicTail[${i}]`, p.number]),
        ...m.agePoints.map((p) => [`age${p.age}`, p.number]),
        ...m.channels.flatMap((ch) =>
          ch.points.map((p, i) => [`${ch.id}[${i}]`, p.number])
        ),
      ];
      for (const [label, n] of all) {
        if (!Number.isInteger(n) || n < 1 || n > 22) {
          outOfRange++;
          if (outOfRange < 10) note("OUT_OF_RANGE", `${iso} ${label}=${n}`);
        }
      }
      if (m.comfort.number !== m.purpose.number) note("COMFORT_NE_PURPOSE", iso);
      if (m.earthTask.number !== m.karmicTail[1].number) note("EARTHTASK_NE_TAILMID", iso);
      if (m.agePoints.length !== 17) note("AGE_POINTS_COUNT", `${iso} ${m.agePoints.length}`);
      focusHistogram.set(m.focusKey, (focusHistogram.get(m.focusKey) ?? 0) + 1);
      for (const slot of DESTINY_MATRIX_DIAGRAM_SLOTS) {
        const p = slot.pick(m);
        if (!p || !Number.isInteger(p.number) || !p.arcanaName) {
          note("SLOT_BROKEN", `${iso} ${slot.key}`);
        }
      }
    }
  }
}

// 2. Age belt coverage for elderly clients.
for (const age of [70, 74, 75, 76, 80, 90, 100]) {
  const birthYear = 2026 - age;
  const m = destinyMatrix(`${birthYear}-01-01`, { asOfDate: "2026-08-03" });
  ageClamp.set(age, { current: m.ageCurrent.age, next: m.ageNext?.age ?? null });
}

// 3. Determinism with frozen options.
const a = destinyMatrix("1979-09-18", { asOfYear: 2026, asOfMonth: 8 });
const b = destinyMatrix("1979-09-18", { asOfYear: 2026, asOfMonth: 8 });
if (JSON.stringify(a) !== JSON.stringify(b)) note("NON_DETERMINISTIC", "1979-09-18");

// 4. Year/month drift: same birth date, different asOfYear.
const y2026 = destinyMatrix("1979-09-18", { asOfYear: 2026, asOfMonth: 8 });
const y2027 = destinyMatrix("1979-09-18", { asOfYear: 2027, asOfMonth: 8 });
const drift = {
  yearArcana: [y2026.yearArcana.number, y2027.yearArcana.number],
  monthArcana: [y2026.monthArcana.number, y2027.monthArcana.number],
  focusKey: [y2026.focusKey, y2027.focusKey],
};

// 5. Reduction must stay the canonical subtract-22 and never fall back to
// digit-sum folding, which caps at 18 and makes arcana 19–22 unreachable.
function subtract22(n) {
  let v = Math.abs(Math.trunc(n));
  while (v > 22) v -= 22;
  return v === 0 ? 22 : v;
}
function digitSumFold(n) {
  let v = Math.abs(Math.trunc(n));
  while (v > 22) {
    v = String(v).split("").reduce((s, d) => s + Number(d), 0);
  }
  return v === 0 ? 22 : v;
}
for (let n = 1; n <= 500; n++) {
  if (reduceToArcanaNumber(n) !== subtract22(n)) {
    note("REDUCE_NOT_CANONICAL", `${n} -> ${reduceToArcanaNumber(n)} (expected ${subtract22(n)})`);
  }
}
const foldRegression = [23, 41, 43, 44].every(
  (n) => reduceToArcanaNumber(n) === digitSumFold(n)
);
if (foldRegression) note("REDUCE_IS_DIGIT_SUM", "reducer reverted to digit-sum folding");

// 6. High arcana must be reachable through reduction (they were not under folding).
const reachable = new Set();
for (let n = 1; n <= 500; n++) reachable.add(reduceToArcanaNumber(n));
for (const n of [19, 20, 21, 22]) {
  if (!reachable.has(n)) note("HIGH_ARCANA_UNREACHABLE", String(n));
}

// 7. Invalid / hostile inputs must not throw.
for (const bad of [
  "", "   ", "not-a-date", "0000-00-00", "1899-12-31", "2101-01-01",
  "2001-02-30", "2001-13-01", "31.12.1988", "1988-13-45", "9999-99-99",
  null, undefined, "1988-2-3", "1988-02-03T10:00:00Z",
]) {
  try {
    const m = destinyMatrix(bad);
    if (m) {
      const bad0 = DESTINY_MATRIX_POINT_KEYS.some((k) => {
        const n = m[k].number;
        return n < 1 || n > 22;
      });
      if (bad0) note("BAD_INPUT_ACCEPTED", JSON.stringify(bad));
    }
  } catch (err) {
    note("THROWS", `${JSON.stringify(bad)} -> ${err.message}`);
  }
}

// 8. arcanaForNumber boundaries.
for (const n of [1, 21, 22]) {
  const p = arcanaForNumber(n);
  if (!p.arcanaName || p.arcanaName.startsWith("Аркан ")) {
    note("ARCANA_NAME_FALLBACK", `${n} -> ${p.arcanaName}`);
  }
}
for (const n of [0, 23, -1]) {
  const p = arcanaForNumber(n);
  if (!p.arcanaName) note("ARCANA_NAME_EMPTY", String(n));
}

console.log("=== destiny matrix invariant audit ===");
console.log("dates checked:", dates, "| out-of-range points:", outOfRange);
console.log("focus histogram:", Object.fromEntries(focusHistogram));
console.log("age belt clamp:", Object.fromEntries(ageClamp));
console.log("year drift 2026->2027:", drift);
console.log("reduction: canonical subtract-22 | high arcana reachable: 19,20,21,22");
console.log("arcanaForNumber(0):", arcanaForNumber(0), "arcanaForNumber(23):", arcanaForNumber(23));
if (problems.length) {
  console.error("FAIL verify-destiny-matrix-invariants:", problems.length, "problems");
  for (const p of problems.slice(0, 40)) console.error(" -", p);
  process.exit(1);
}
console.log(`OK verify-destiny-matrix-invariants (${dates} dates, all points 1–22)`);
