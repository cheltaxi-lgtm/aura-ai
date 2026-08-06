/**
 * Human Design engine verification (no DB).
 *
 * Blocks:
 *  1. Mandala invariants (wheel order, sizes, boundary rule)
 *  2. Reference-table integrity (channels/centers/gates/crosses)
 *  3. 88° solar-arc solver precision (<= 1 arcsecond)
 *  4. JPL Horizons golden anchors (baked values, offline)
 *  5. Astronomy anchors (equinox/solstice)
 *  6. Synthetic type & authority logic (strict R-6/R-7)
 *  7. Profile invariant on random dates (12 valid profiles only)
 *  8. Cross-validation vs natalengine calculateHumanDesign (type/profile)
 *  9. Determinism, unknown-time stability probe
 * 10. Optional analyst golden set: scripts/fixtures/human-design-golden.json
 *     (Jovian Archive reference charts — strict equality when present)
 * 11. Source guardrails: public-payload privacy strip, claim-token hashing,
 *     double-billing dedupe, durable async-job wiring (static asserts)
 *
 * Run: npm run verify:human-design
 */

import { readFileSync, existsSync } from "node:fs";
import {
  calculateHdChart,
  hdAuthorityFromChannels,
  hdTypeFromChannels,
  longitudeToActivation,
} from "../src/lib/human-design/calculate.ts";
import {
  CHANNELS,
  CROSS_NAMES_EN,
  CROSS_NAMES_RU,
  GATE_CENTERS,
  GATE_NAMES_RU,
  GATE_ORDER,
  VALID_PROFILES,
} from "../src/lib/human-design/constants.ts";
import {
  hdLongitudesAt,
  julianDateFromUnixMs,
  sunLongitudeAt,
} from "../src/lib/human-design/ephemeris.ts";
import { hdFingerprint } from "../src/lib/human-design/fingerprint.ts";
import { spawnSync } from "node:child_process";

const failures = [];
let checks = 0;

function assert(cond, label) {
  checks++;
  if (!cond) failures.push(label);
}

function signedDelta(a, b) {
  let d = (((a % 360) + 360) % 360) - (((b % 360) + 360) % 360);
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 1. Mandala invariants ---------- */

assert(GATE_ORDER.length === 64, "GATE_ORDER has 64 gates");
assert(
  new Set(GATE_ORDER).size === 64 && GATE_ORDER.every((g) => g >= 1 && g <= 64),
  "GATE_ORDER is a permutation of 1..64"
);
assert(GATE_ORDER[0] === 25, "wheel starts at gate 25 (358.25 deg)");
{
  const idx41 = GATE_ORDER.indexOf(41);
  const start41 = (358.25 + idx41 * 5.625) % 360;
  assert(Math.abs(start41 - 302) < 1e-9, `gate 41 starts at 302 deg (got ${start41})`);
}
// Boundary rule: [start, end) — lower bound inclusive.
assert(longitudeToActivation("sun", 358.25).gate === 25, "358.25 deg -> gate 25");
assert(longitudeToActivation("sun", 358.25).line === 1, "358.25 deg -> line 1");
{
  const just = longitudeToActivation("sun", 358.25 - 1e-6);
  assert(just.gate === 36 && just.line === 6, "1 mas before wheel start -> gate 36 line 6");
  const g41 = longitudeToActivation("sun", 302);
  assert(g41.gate === 41 && g41.line === 1, "302 deg -> gate 41 line 1");
  const g41end = longitudeToActivation("sun", 302 + 5.625 - 1e-6);
  assert(g41end.gate === 41 && g41end.line === 6, "end of gate 41 -> line 6");
  const next = longitudeToActivation("sun", 302 + 5.625);
  assert(next.gate === 19 && next.line === 1, "gate boundary -> next gate line 1");
  const zero = longitudeToActivation("sun", 0);
  assert(zero.gate === 25 && zero.line === 2, `0 deg -> gate 25 line 2 (got ${zero.gate}.${zero.line})`);
  // Line boundaries inside a gate
  for (let line = 1; line <= 6; line++) {
    const lon = 302 + (line - 1) * 0.9375;
    const act = longitudeToActivation("sun", lon);
    assert(act.gate === 41 && act.line === line, `gate 41 line boundary ${line}`);
  }
}

/* ---------- 2. Table integrity ---------- */

assert(CHANNELS.length === 36, "36 channels");
{
  let gateSlots = 0;
  const seen = new Set();
  for (const ch of CHANNELS) {
    gateSlots += 2;
    seen.add(ch.gates[0]);
    seen.add(ch.gates[1]);
    assert(
      GATE_CENTERS[ch.gates[0]] === ch.centers[0] && GATE_CENTERS[ch.gates[1]] === ch.centers[1],
      `channel ${ch.gates[0]}-${ch.gates[1]} centers match gate table`
    );
    assert(ch.nameRu.length > 2 && ch.nameEn.length > 2, `channel ${ch.gates[0]}-${ch.gates[1]} named`);
  }
  assert(gateSlots === 72, "72 channel gate slots");
  assert(seen.size === 64, "every gate appears in at least one channel");
}
for (let g = 1; g <= 64; g++) {
  assert(Boolean(GATE_CENTERS[g]), `gate ${g} has a center`);
  assert(Boolean(GATE_NAMES_RU[g]), `gate ${g} has RU name`);
  assert(Boolean(CROSS_NAMES_EN[g]) && Boolean(CROSS_NAMES_RU[g]), `gate ${g} has cross names`);
}
assert(VALID_PROFILES.length === 12, "12 valid profiles");

/* ---------- 3. Solver precision ---------- */

{
  const rand = mulberry32(42);
  let worst = 0;
  for (let i = 0; i < 50; i++) {
    const year = 1900 + Math.floor(rand() * 150);
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    const hh = Math.floor(rand() * 24);
    const mm = Math.floor(rand() * 60);
    const ms = Date.UTC(year, month - 1, day, hh, mm);
    const birthJd = julianDateFromUnixMs(ms);
    const birthSun = sunLongitudeAt(birthJd);
    const chart = calculateHdChart({
      birthDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      birthTime: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
      timezone: "UTC",
    });
    const designJd = julianDateFromUnixMs(new Date(chart.design.utcIso).getTime());
    const errArcsec = Math.abs(signedDelta(sunLongitudeAt(designJd), birthSun - 88)) * 3600;
    worst = Math.max(worst, errArcsec);
    const daysBefore = (birthJd - designJd);
    assert(daysBefore > 84 && daysBefore < 94, `design moment 84-94 days before (got ${daysBefore.toFixed(2)})`);
  }
  assert(worst <= 1, `solver worst error <= 1 arcsec (got ${worst.toFixed(3)}")`);
  console.log(`  solver worst error over 50 random instants: ${worst.toFixed(3)}"`);
}

/* ---------- 4. JPL Horizons golden anchors (baked, offline) ---------- */
/* Values fetched from NASA JPL Horizons QUANTITIES=31 (apparent ecliptic
   of date, geocentric) on 2026-08-03. Tolerance 1 arcminute. */

const JPL_ANCHORS = [
  { body: "pluto", utc: "1932-07-01T05:00:00.000Z", lon: 111.3529 },
  { body: "mercury", utc: "1955-02-10T03:00:00.000Z", lon: 326.2516 },
  { body: "pluto", utc: "1955-02-10T03:00:00.000Z", lon: 145.693 },
  { body: "moon", utc: "1955-02-10T03:00:00.000Z", lon: 178.1076 },
  { body: "mercury", utc: "1999-12-31T14:05:00.000Z", lon: 270.4703 },
  { body: "pluto", utc: "1999-12-31T14:05:00.000Z", lon: 251.4225 },
];
for (const a of JPL_ANCHORS) {
  const got = hdLongitudesAt(julianDateFromUnixMs(new Date(a.utc).getTime()))[a.body];
  const errMin = Math.abs(signedDelta(got, a.lon)) * 60;
  assert(errMin <= 1, `JPL anchor ${a.body} @ ${a.utc}: err ${errMin.toFixed(2)}' (<= 1')`);
}

/* ---------- 5. Astronomy anchors ---------- */
/* Equinox/solstice instants (UTC, NASA): apparent Sun = 0/90 deg by definition.
   Engine uses the mean equinox of date (nutation in longitude, up to ~17",
   is not modelled), so allow 45 arcsec. */
{
  const anchors = [
    ["2000-03-20T07:35:14Z", 0],
    ["2024-03-20T03:06:21Z", 0],
    ["2024-06-20T20:50:56Z", 90],
    ["2024-09-22T12:43:36Z", 180],
    ["2024-12-21T09:20:30Z", 270],
  ];
  for (const [iso, expected] of anchors) {
    const lon = sunLongitudeAt(julianDateFromUnixMs(new Date(iso).getTime()));
    const errArcsec = Math.abs(signedDelta(lon, expected)) * 3600;
    assert(errArcsec <= 45, `anchor ${iso}: Sun=${lon.toFixed(5)} (err ${errArcsec.toFixed(1)}")`);
  }
  // Sun at J2000.0 (mean longitude 280.460, apparent ~280.369)
  const j2000 = sunLongitudeAt(julianDateFromUnixMs(Date.UTC(2000, 0, 1, 12, 0, 0)));
  assert(Math.abs(j2000 - 280.369) < 0.01, `Sun at J2000 ~280.369 (got ${j2000.toFixed(5)})`);
}

/* ---------- 6. Synthetic type & authority logic ---------- */

const TYPE_CASES = [
  [[], "reflector"],
  [["3-60"], "generator"], // sacral defined, no throat
  [["20-34"], "manifestingGenerator"], // sacral motor to throat
  [["34-57", "20-57"], "manifestingGenerator"], // sacral via spleen to throat
  [["21-45"], "manifestor"], // ego motor to throat, no sacral
  [["35-36"], "manifestor"], // emotional motor to throat
  [["18-58", "16-48"], "manifestor"], // root motor via spleen to throat
  [["25-51", "1-8"], "manifestor"], // ego reaches throat through G
  [["4-63", "17-62"], "projector"], // head-ajna-throat, no motor
  [["1-8"], "projector"], // G-throat, no motor
  [["27-50"], "generator"], // sacral-spleen
];
for (const [channels, expected] of TYPE_CASES) {
  const got = hdTypeFromChannels(channels);
  assert(got === expected, `type ${JSON.stringify(channels)} -> ${expected} (got ${got})`);
}

const AUTHORITY_CASES = [
  [[], "lunar"],
  [["3-60"], "sacral"],
  [["6-59"], "emotional"], // solar defined beats sacral? no sacral here -> emotional
  [["6-59", "3-60"], "emotional"], // solar beats sacral
  [["27-50"], "sacral"], // sacral beats spleen in the hierarchy
  [["18-58", "16-48"], "splenic"], // spleen only
  [["21-45"], "egoManifested"],
  [["25-51"], "egoProjected"], // heart->G, no throat
  [["25-51", "1-8"], "egoManifested"], // heart reaches throat via G
  [["1-8"], "selfProjected"],
  [["4-63", "17-62"], "mental"], // projector, no G-throat
  [["37-40"], "emotional"], // solar via heart channel
];
for (const [channels, expected] of AUTHORITY_CASES) {
  const got = hdAuthorityFromChannels(channels);
  assert(got === expected, `authority ${JSON.stringify(channels)} -> ${expected} (got ${got})`);
}

/* ---------- 7. Profile invariant on random dates ---------- */

{
  const rand = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const year = 1920 + Math.floor(rand() * 110);
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    const hh = Math.floor(rand() * 24);
    const mm = Math.floor(rand() * 60);
    const chart = calculateHdChart({
      birthDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      birthTime: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
      timezone: "UTC",
    });
    assert(
      VALID_PROFILES.includes(chart.profile),
      `profile ${chart.profile} valid @ ${year}-${month}-${day} ${hh}:${mm}`
    );
    // 88 deg arc => design line = personality line + 2 or + 3 (mod 6)
    const [pLine, dLine] = chart.profileLines;
    const delta = (dLine - pLine + 6) % 6;
    assert(delta === 2 || delta === 3, `line delta +2/+3 (got ${delta})`);
    // Earth is always opposite Sun
    const pSun = chart.personality.find((a) => a.body === "sun");
    const pEarth = chart.personality.find((a) => a.body === "earth");
    assert(
      Math.abs(signedDelta(pEarth.longitude, pSun.longitude + 180)) < 1e-6,
      "earth opposite sun"
    );
  }
}

/* ---------- 8. Cross-validation vs natalengine HD (type/profile) ---------- */

const XV_CASES = [
  ["1990-06-15", "14:59", "Europe/Moscow"],
  ["1985-10-22", "07:30", "Europe/Moscow"],
  ["2000-01-01", "00:05", "Asia/Vladivostok"],
  ["1975-03-20", "18:45", "America/New_York"],
  ["2012-07-15", "12:00", "Europe/Moscow"],
  ["1955-02-10", "06:00", "Europe/Kyiv"],
  ["1988-12-31", "23:40", "Asia/Novosibirsk"],
  ["1932-07-01", "08:00", "Europe/Moscow"],
  ["1945-05-09", "00:01", "Europe/Berlin"],
  ["2026-08-04", "12:00", "Asia/Tokyo"],
];
const TYPE_NAME_MAP = {
  Manifestor: "manifestor",
  Generator: "generator",
  "Manifesting Generator": "manifestingGenerator",
  Projector: "projector",
  Reflector: "reflector",
};
{
  // natalengine must run under plain node: tsx's module interop breaks its
  // `import * as Astronomy` namespace (Astronomy.GeoVector goes missing), so
  // the reference implementation is evaluated in a child node process.
  const childScript = `
    import { calculateHumanDesign, resolveUtcOffset } from "natalengine";
    const cases = ${JSON.stringify(XV_CASES)};
    const out = cases.map(([date, time, tz]) => {
      const offset = resolveUtcOffset(date, time, tz);
      const [hh, mm] = time.split(":").map(Number);
      const r = calculateHumanDesign(date, hh + mm / 60, offset, { nodeType: "true" });
      return { type: r.type.name, profile: r.profile.numbers };
    });
    process.stdout.write(JSON.stringify(out));
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", childScript], {
    encoding: "utf8",
    cwd: process.cwd(),
    maxBuffer: 16 * 1024 * 1024,
  });
  let theirsList = null;
  if (child.status === 0) {
    try {
      theirsList = JSON.parse(child.stdout);
    } catch {
      theirsList = null;
    }
  }
  assert(
    Array.isArray(theirsList) && theirsList.length === XV_CASES.length,
    `xv reference process failed: ${child.stderr?.slice(0, 300) || child.error?.message || "bad output"}`
  );
  let typeMatch = 0;
  let profileMatch = 0;
  if (Array.isArray(theirsList)) {
    for (let i = 0; i < XV_CASES.length; i++) {
      const [date, time, tz] = XV_CASES[i];
      const mine = calculateHdChart({ birthDate: date, birthTime: time, timezone: tz });
      const theirs = theirsList[i];
      const theirType = TYPE_NAME_MAP[theirs.type];
      if (theirType === mine.type) typeMatch++;
      else failures.push(`xv type ${date} ${time} ${tz}: mine ${mine.type} vs theirs ${theirs.type}`);
      if (theirs.profile === mine.profile) profileMatch++;
      else failures.push(`xv profile ${date} ${time} ${tz}: mine ${mine.profile} vs theirs ${theirs.profile}`);
    }
  }
  console.log(`  cross-validation: type ${typeMatch}/${XV_CASES.length}, profile ${profileMatch}/${XV_CASES.length}`);
}

/* ---------- 9. Determinism + unknown-time ---------- */

{
  const a = calculateHdChart({ birthDate: "1990-06-15", birthTime: "14:59", timezone: "Europe/Moscow" });
  const b = calculateHdChart({ birthDate: "1990-06-15", birthTime: "14:59", timezone: "Europe/Moscow" });
  assert(JSON.stringify(a) === JSON.stringify(b), "deterministic output");

  const unknown = calculateHdChart({ birthDate: "1990-06-15", birthTime: null, timezone: "Europe/Moscow" });
  assert(unknown.timeKnown === false, "timeKnown=false when time omitted");
  assert(Boolean(unknown.stability), "stability probe present for unknown time");
  assert(
    typeof unknown.stability.typeStable === "boolean" &&
      typeof unknown.stability.authorityStable === "boolean" &&
      typeof unknown.stability.profileStable === "boolean",
    "stability flags are booleans"
  );
  const known = calculateHdChart({ birthDate: "1990-06-15", birthTime: "14:59", timezone: "Europe/Moscow" });
  assert(known.stability === undefined, "no stability probe when time known");

  // Whitespace-only time must behave as unknown time, not as a known noon.
  const ws = calculateHdChart({ birthDate: "1990-06-15", birthTime: "  ", timezone: "Europe/Moscow" });
  assert(ws.timeKnown === false && Boolean(ws.stability), "whitespace birthTime treated as unknown");

  // Pinned probe outcomes: 1985-01-01 oscillates projector↔generator within
  // the day (Moon-defined channel), 1985-01-16 keeps type+authority all day.
  const unstableDay = calculateHdChart({ birthDate: "1985-01-01", birthTime: null, timezone: "Europe/Moscow" });
  assert(unstableDay.stability?.typeStable === false, "probe: 1985-01-01 type unstable");
  const stableDay = calculateHdChart({ birthDate: "1985-01-16", birthTime: null, timezone: "Europe/Moscow" });
  assert(
    stableDay.stability?.typeStable === true && stableDay.stability?.authorityStable === true,
    "probe: 1985-01-16 type+authority stable"
  );
}

/* ---------- 9b. Wheel-wrap cell ("franken-cell") regression ---------- */
/* A longitude within FP_EPSILON below the 360° wrap resolves UP into the
   first wheel gate — and must carry that gate's FIRST line/color/tone/base,
   not clamped maxima computed from a ~360° within-gate offset. */
{
  const wrap = longitudeToActivation("sun", 358.25 - 1e-10);
  assert(wrap.gate === 25, `wrap: gate 25 (got ${wrap.gate})`);
  assert(
    wrap.line === 1 && wrap.color === 1 && wrap.tone === 1 && wrap.base === 1,
    `wrap: sub-structure 1/1/1/1 (got ${wrap.line}/${wrap.color}/${wrap.tone}/${wrap.base})`
  );
}

/* ---------- 9c. Fingerprint normalization ---------- */
/* One person = one fingerprint: time padding, place whitespace/case and
   timezone casing must not fragment the identity (else duplicate guest-pool
   rows and double-paid reports for the same chart). */
{
  const base = {
    birthDate: "1990-05-15",
    birthTime: "07:30",
    timezone: "Europe/Moscow",
    placeName: "Москва",
    lat: 55.7558,
    lon: 37.6173,
  };
  const fp = (over) => hdFingerprint({ ...base, ...over });
  assert(fp({}) === fp({ birthTime: "7:30" }), "fingerprint: time padding normalized");
  assert(
    fp({}) === fp({ placeName: "  москва   " }),
    "fingerprint: place case/whitespace normalized"
  );
  assert(
    fp({}) === fp({ timezone: "europe/moscow" }),
    "fingerprint: timezone casing canonicalized"
  );
  assert(
    fp({}) !== fp({ timezone: "Europe/Kyiv" }),
    "fingerprint: different tz → different fingerprint"
  );
  assert(fp({ birthTime: null }) !== fp({}), "fingerprint: unknown time differs from known");
}

/* ---------- 10. Regression golden set ---------- */
/* Fixtures pinned from the current engine via scripts/gen-hd-golden-fixtures.mjs.
   They guard against silent engine regressions (ephemeris swap, wheel offset,
   timezone DB drift). NOTE: these are regression pins, not external validation —
   cross-checking against Jovian Archive reference charts remains a manual
   analyst task (any verified chart should be appended with source label). */

{
  const path = new URL("./fixtures/human-design-golden.json", import.meta.url);
  if (existsSync(path)) {
    const fixtures = JSON.parse(readFileSync(path, "utf8"));
    if (Array.isArray(fixtures) && fixtures.length > 0) {
      for (const f of fixtures) {
        const chart = calculateHdChart({
          birthDate: f.birthDate,
          birthTime: f.birthTime ?? null,
          timezone: f.timezone,
        });
        assert(chart.type === f.expected.type, `golden ${f.label}: type`);
        assert(chart.profile === f.expected.profile, `golden ${f.label}: profile`);
        assert(chart.authority === f.expected.authority, `golden ${f.label}: authority`);
        if (f.expected.definition !== undefined) {
          assert(chart.definition === f.expected.definition, `golden ${f.label}: definition`);
        }
        if (f.expected.activeGates !== undefined) {
          assert(
            chart.activeGates.length === f.expected.activeGates,
            `golden ${f.label}: activeGates ${chart.activeGates.length} == ${f.expected.activeGates}`
          );
        }
        if (f.expected.definedChannels !== undefined) {
          const dc = chart.channels.filter((c) => c.defined).length;
          assert(dc === f.expected.definedChannels, `golden ${f.label}: definedChannels ${dc} == ${f.expected.definedChannels}`);
        }
        for (const side of ["personality", "design"]) {
          const mine = side === "personality" ? chart.personality : chart.designActivations;
          for (const [body, gateLine] of Object.entries(f.expected[side] ?? {})) {
            const act = mine.find((a) => a.body === body);
            assert(
              act && `${act.gate}.${act.line}` === gateLine,
              `golden ${f.label}: ${side} ${body} ${act ? `${act.gate}.${act.line}` : "??"} == ${gateLine}`
            );
          }
        }
        if (f.expected.stability !== undefined) {
          assert(
            JSON.stringify(chart.stability) === JSON.stringify(f.expected.stability),
            `golden ${f.label}: stability ${JSON.stringify(chart.stability)} == ${JSON.stringify(f.expected.stability)}`
          );
        }
      }
      console.log(`  golden set: ${fixtures.length} regression fixtures checked strictly`);
    } else {
      console.log("  golden set: fixtures file empty — run scripts/gen-hd-golden-fixtures.mjs");
    }
  } else {
    console.log("  golden set: no fixtures file — run scripts/gen-hd-golden-fixtures.mjs");
  }
}

/* ---------- 11. Sub-structure boundary rule (color/tone/base) ---------- */
/* longitudeToActivation owns boundaries deterministically: a point exactly on
   a boundary (or within 1e-9° below it, float fuzz) belongs to the UPPER cell;
   1e-6° below belongs to the LOWER cell. Verified on gate/line/color/tone/base. */

{
  const GATE_SIZE = 5.625;
  const WHEEL_OFFSET = 358.25; // GATE_WHEEL_OFFSET from constants.ts
  // Gate k of the wheel starts at (WHEEL_OFFSET + k*GATE_SIZE) mod 360.
  const gateStart = (WHEEL_OFFSET + 3 * GATE_SIZE) % 360; // 4th gate on the wheel
  const startAct = longitudeToActivation("sun", gateStart);

  // Exact cell interiors: a 1e-12° perturbation must keep every cell.
  const mid = gateStart + GATE_SIZE / 2;
  const a1 = longitudeToActivation("sun", mid);
  const a2 = longitudeToActivation("sun", mid + 1e-12);
  assert(
    a1.gate === a2.gate && a1.line === a2.line && a1.color === a2.color &&
    a1.tone === a2.tone && a1.base === a2.base,
    "boundary: 1e-12° perturbation keeps every cell"
  );

  // Walk exactly one gate width from its start: sub-structure indices must be
  // monotonically non-decreasing and within range (no wrap, no out-of-range).
  let prevKey = -1;
  let monotone = true;
  let inRange = true;
  for (let i = 0; i < 200; i++) {
    const lon = gateStart + (i / 200) * (GATE_SIZE - 1e-6);
    const a = longitudeToActivation("sun", lon);
    if (a.gate !== startAct.gate) { inRange = false; break; }
    if (a.line < 1 || a.line > 6 || a.color < 1 || a.color > 6 || a.tone < 1 || a.tone > 6 || a.base < 1 || a.base > 5) {
      inRange = false;
      break;
    }
    const key = (((a.line * 6 + a.color) * 6 + a.tone) * 5 + a.base);
    if (key < prevKey) { monotone = false; break; }
    prevKey = key;
  }
  assert(inRange, "boundary: color/tone/base stay in range across a full gate");
  assert(monotone, "boundary: sub-structure indices monotone across a full gate");

  // Documented ownership rule: the exact boundary belongs to the UPPER gate,
  // float fuzz (1e-9°) below it still resolves UP, real input (1e-6°) stays DOWN.
  const atBoundary = longitudeToActivation("sun", gateStart + GATE_SIZE);
  const fuzzBelow = longitudeToActivation("sun", gateStart + GATE_SIZE - 1e-9);
  const realBelow = longitudeToActivation("sun", gateStart + GATE_SIZE - 1e-6);
  const nextGate = longitudeToActivation("sun", gateStart + GATE_SIZE + GATE_SIZE / 2).gate;
  assert(atBoundary.gate === nextGate, "boundary: exact boundary belongs to the upper gate");
  assert(fuzzBelow.gate === nextGate, "boundary: 1e-9° below boundary resolves up (float fuzz)");
  assert(
    realBelow.gate === startAct.gate && realBelow.line === 6,
    "boundary: 1e-6° below boundary stays in the lower gate, line 6"
  );
}

/* ---------- 11. source guardrails: privacy, claim hashing, async delivery ---------- */

{
  const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const serviceSrc = src("../src/lib/services/human-design-service.ts");
  const reportRoute = src("../src/app/api/human-design/report/route.ts");
  const compositeRoute = src("../src/app/api/human-design/composite-report/route.ts");
  const registry = src("../src/lib/async-job-registry.ts");
  const workerShared = src("../src/lib/async-job-worker-auth-shared.ts");
  const jobsActive = src("../src/app/api/jobs/active/route.ts");
  const asyncJobs = src("../src/lib/async-jobs.ts");
  const schemaSql = src("../src/lib/schema.sql");

  // Public share payload: design moment and raw longitudes never leave the
  // server (both make the birth instant recoverable).
  assert(
    serviceSrc.includes("design: _design") && serviceSrc.includes("longitude: _lon"),
    "guardrail: public HD payload strips design moment and longitudes"
  );

  // Claim tokens are sha256-hashed at rest with a legacy dual-read transition.
  assert(
    serviceSrc.includes("hashHdClaimToken") && serviceSrc.includes('createHash("sha256")'),
    "guardrail: claim tokens are sha256-hashed"
  );
  assert(
    /claim_token = \$3 OR claim_token = \$4/.test(serviceSrc),
    "guardrail: claim matches hash with legacy dual-read transition"
  );

  // Double-billing guards wired into both purchase routes.
  assert(
    reportRoute.includes("findDuplicateDoneHdReport"),
    "guardrail: personal report route dedupes identical mechanics"
  );
  assert(
    compositeRoute.includes("findDuplicateDoneCompositeReport"),
    "guardrail: composite route dedupes identical mechanics"
  );

  // Durable async delivery for both report kinds.
  assert(
    asyncJobs.includes('"hd_report"') && asyncJobs.includes('"hd_composite_report"'),
    "guardrail: AsyncJobKind covers hd_report and hd_composite_report"
  );
  assert(
    registry.includes('kind: "hd_report"') && registry.includes('kind: "hd_composite_report"'),
    "guardrail: registry configures both HD job kinds"
  );
  assert(
    registry.includes('"hd_report",') && registry.includes('"hd_composite_report",'),
    "guardrail: DEFAULT_WORKER_KINDS includes HD kinds"
  );
  assert(
    workerShared.includes('pathname === "/api/human-design/report"') &&
      workerShared.includes('pathname === "/api/human-design/composite-report"'),
    "guardrail: middleware worker whitelist covers HD report paths"
  );
  assert(
    jobsActive.includes('"hd_report"') && jobsActive.includes('"hd_composite_report"'),
    "guardrail: jobs/active KIND_SET includes HD kinds"
  );

  // DB contract: async_jobs kind CHECK must accept HD kinds (schema.sql +
  // a migration that widens the live constraint — enqueue INSERTs fail 500
  // on production without it).
  assert(
    schemaSql.includes("'hd_report'") && schemaSql.includes("'hd_composite_report'"),
    "guardrail: schema.sql async_jobs kind CHECK includes HD kinds"
  );
  assert(
    existsSync(new URL("../scripts/migrations/108_migrate_hd_async_job_kinds.sql", import.meta.url)),
    "guardrail: migration 108 widens async_jobs kind CHECK for HD kinds"
  );
  for (const [name, routeSrc] of [
    ["report", reportRoute],
    ["composite-report", compositeRoute],
  ]) {
    assert(
      routeSrc.includes("getAsyncJobWorkerUserId"),
      `guardrail: ${name} route resolves worker user`
    );
    assert(
      routeSrc.includes("enqueuePaidAsyncJob"),
      `guardrail: ${name} route enqueues async job`
    );
    assert(
      routeSrc.includes("beginWorkerJobSave"),
      `guardrail: ${name} route claims save before persist`
    );
    assert(
      routeSrc.includes("trackWorkerJobCompleted") && routeSrc.includes("trackWorkerJobFailed"),
      `guardrail: ${name} route tracks job lifecycle`
    );
    assert(
      routeSrc.includes("ensureSufficientRunes"),
      `guardrail: ${name} route pre-checks balance before enqueue`
    );
  }
}

/* ---------- result ---------- */

console.log(`\n${checks} checks, ${failures.length} failures`);
if (failures.length > 0) {
  for (const f of failures.slice(0, 40)) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
console.log("verify-human-design: OK");
