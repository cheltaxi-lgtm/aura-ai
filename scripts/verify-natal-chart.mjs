#!/usr/bin/env node
/**
 * Natal chart engine smoke + reference tests (no DB).
 * Run: npm run verify:natal-chart
 */
import { computeNatalChartRecord } from "../src/lib/natal/compute.ts";
import { buildNatalPromptBlock } from "../src/lib/natal/format-prompt.ts";
import { computeDeepTransits, detectSignIngresses } from "../src/lib/natal/transits.ts";
import { computeSynastry, computeSynastryDimensions, sanitizeSynastryForClient } from "../src/lib/natal/synastry.ts";
import { compositeMidpointLongitude, computeCompositeChart } from "../src/lib/natal/composite.ts";
import {
  allowedShareSections, isHighEntropyShareToken,
  sanitizeCompatibilityReportShare, sanitizeNatalReportShare, sanitizeRelationshipReportShare,
} from "../src/lib/natal/report-share.ts";
import {
  buildCompatibilityEvidence,
  COMPATIBILITY_REPORT_SECTION_KEYS,
  validateCompatibilityReport,
} from "../src/lib/natal/compatibility-report.ts";
import { angularSeparation, houseForLongitude } from "../src/lib/natal/math.ts";
import { computeAspects } from "../src/lib/natal/aspects.ts";
import { toCelestineBirthData } from "../src/lib/natal/celestine/adapter.ts";
import { computeWesternChart } from "../src/lib/natal/western.ts";
import { addDaysInTimezone } from "../src/lib/natal/sky.ts";
import { searchFallbackCities, resolveFallbackCity } from "../src/lib/natal/cities-fallback.ts";
import { searchGeonames, geonamesIndexLoaded } from "../src/lib/natal/geonames.ts";
import { NATAL_ENGINE_VERSION } from "../src/lib/natal/types.ts";
import {
  buildNatalEvidence,
  scopeNatalEvidence,
} from "../src/lib/natal/evidence.ts";
import {
  NATAL_REPORT_SECTION_KEYS,
  validateNatalReport,
  withReportMetadataDefaults,
} from "../src/lib/natal/report.ts";
import { navamsaFromSiderealLongitude, validateNormalizedVimshottari } from "../src/lib/natal/vedic.ts";
import {
  computeSecondaryProgressions,
  computeSolarReturn,
  computeTransitTimeline,
  parseTimingHorizon,
  progressedInstantForTarget,
  solarReturnBirthdayAnchor,
  sortTimingEvents,
} from "../src/lib/natal/timing.ts";
import {
  aspectRows,
  bigThree,
  methodology,
  positionRows,
} from "../src/lib/natal/presentation.ts";
import { isNatalContextEnabled } from "../src/lib/natal/ai-context-consent.ts";
import { readFileSync } from "node:fs";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sunLongitude(chart) {
  const sun = chart.western?.sun;
  if (!sun || typeof sun !== "object") return null;
  const lon = sun.longitude;
  return typeof lon === "number" ? lon : null;
}

function signName(body) {
  if (!body || typeof body !== "object") return null;
  const signObj = body.sign;
  if (typeof signObj === "string") return signObj;
  if (signObj && typeof signObj === "object" && typeof signObj.name === "string") return signObj.name;
  return null;
}

function assertNear(actual, expected, tolerance, label) {
  if (actual == null || Math.abs(actual - expected) > tolerance) {
    failures.push(`${label}: expected ~${expected}°, got ${actual}`);
  }
}

async function testCase(label, input) {
  const chart = await computeNatalChartRecord(`test-${label}`, input);
  assert(chart.western, `${label}: western chart`);
  assert(chart.vedic, `${label}: vedic chart`);
  assert(chart.place?.timezone, `${label}: timezone`);
  assert(chart.engineVersion === NATAL_ENGINE_VERSION, `${label}: engine version`);
  assert(typeof chart.birthFingerprint === "string", `${label}: birth fingerprint`);

  const sunSign = signName(chart.western?.sun);
  assert(typeof sunSign === "string" && sunSign.length > 0, `${label}: sun sign`);

  const transits = await computeDeepTransits(chart, { correlateMemory: false });
  assert(Array.isArray(transits), `${label}: transits array`);
  assert(
    transits.some((t) => t.kind === "aspect_hit" || t.kind === "sign_change"),
    `${label}: deep transits`
  );

  const prompt = buildNatalPromptBlock(chart);
  assert(prompt.includes("НАТАЛЬНАЯ КАРТА"), `${label}: prompt header`);
  return chart;
}

async function main() {
  const edgeBirth = toCelestineBirthData({
    birthDate: "1990-06-15",
    localHourDecimal: 14 + 59 / 60 + 45 / 3600,
    utcOffsetHours: -4,
    latitude: 40.7,
    longitude: -74,
  });
  assert(edgeBirth.hour === 14 && edgeBirth.minute === 59 && edgeBirth.second === 45, "time decomposition preserves :59:45");

  const equalCusps = Array.from({ length: 12 }, (_, i) => i * 30);
  assert(houseForLongitude(equalCusps, 0) === 1, "house boundary 0° → house 1");
  assert(houseForLongitude(equalCusps, 29.999) === 1, "house boundary before 30° → house 1");
  assert(houseForLongitude(equalCusps, 30) === 2, "house boundary 30° → house 2");
  assert(houseForLongitude(equalCusps, 359.999) === 12, "house boundary wrap → house 12");

  const navamsaBoundaryReferences = [
    [0, 1, "Mesha"],
    [3.3333333333333335, 2, "Vrishabha"],
    [6.666666666666667, 3, "Mithuna"],
    [10, 4, "Karka"],
    [13.333333333333334, 5, "Simha"],
    [16.666666666666668, 6, "Kanya"],
    [20, 7, "Tula"],
    [23.333333333333336, 8, "Vrishchika"],
    [26.666666666666668, 9, "Dhanu"],
  ];
  for (const [longitude, expectedSign, expectedName] of navamsaBoundaryReferences) {
    const d9 = navamsaFromSiderealLongitude(longitude);
    assert(
      d9.rashiIndex === expectedSign && d9.rashiName === expectedName,
      `D9 Aries 3°20′ boundary ${longitude}° → ${expectedName}`
    );
  }
  const independentD9Fixtures = [
    { longitude: 0, sign: "Mesha", pada: 1, label: "movable start" },
    { longitude: 30, sign: "Makara", pada: 1, label: "fixed start" },
    { longitude: 60, sign: "Tula", pada: 1, label: "dual start" },
    { longitude: 29.999, sign: "Dhanu", pada: 9, label: "end of sign" },
    { longitude: 43.333333333333336, sign: "Vrishabha", pada: 5, label: "fixed middle" },
    { longitude: 86.66666666666667, sign: "Mithuna", pada: 9, label: "dual end" },
  ];
  for (const fixture of independentD9Fixtures) {
    const actual = navamsaFromSiderealLongitude(fixture.longitude);
    assert(
      actual.rashiName === fixture.sign && actual.pada === fixture.pada,
      `D9 independent ${fixture.label} fixture`
    );
  }
  const rahuCounterexample = navamsaFromSiderealLongitude(10);
  const ketuCounterexample = navamsaFromSiderealLongitude(189.5);
  assert(
    Math.abs(angularSeparation(rahuCounterexample.longitude, ketuCounterexample.longitude) - 180) > 1,
    "D9 Rahu/Ketu are computed independently; non-opposite source nodes are not forced opposite"
  );
  assert(navamsaFromSiderealLongitude(360).rashiName === "Mesha", "D9 360° normalizes to 0°");
  assert(navamsaFromSiderealLongitude(-360).rashiName === "Mesha", "D9 negative full turn normalizes to 0°");

  assert(
    addDaysInTimezone("Pacific/Kiritimati", "2026-07-14", 1) === "2026-07-15",
    "date-line calendar add stays one day"
  );
  assert(
    addDaysInTimezone("America/New_York", "2026-03-08", 1) === "2026-03-09",
    "DST spring boundary stays one calendar day"
  );
  assert(
    addDaysInTimezone("Etc/GMT+12", "2024-02-28", 1) === "2024-02-29" &&
      addDaysInTimezone("Pacific/Kiritimati", "2024-02-29", 1) === "2024-03-01" &&
      addDaysInTimezone("Pacific/Kiritimati", "2026-01-01", -1) === "2025-12-31",
    "local calendar arithmetic is stable across UTC-12/UTC+14 and leap boundaries"
  );
  assert(
    solarReturnBirthdayAnchor("2000-02-29", 2025) === "2025-02-28" &&
      solarReturnBirthdayAnchor("2000-02-29", 2024) === "2024-02-29",
    "solar-return Feb-29 policy uses Feb-28 in non-leap years"
  );
  const placidusWrapCusps = [350, 18, 47, 78, 108, 138, 168, 198, 228, 258, 288, 318];
  assert(
    houseForLongitude(placidusWrapCusps, 359.9) === 1 &&
      houseForLongitude(placidusWrapCusps, 0) === 1 &&
      houseForLongitude(placidusWrapCusps, 18) === 2 &&
      houseForLongitude(placidusWrapCusps, 349.999) === 12,
    "Placidus cusp assignment handles wrap and exact cusp inclusion"
  );
  const goldenAspects = computeAspects([
    { id: "a", longitude: 359 },
    { id: "b", longitude: 1 },
    { id: "c", longitude: 89 },
    { id: "d", longitude: 179 },
  ]);
  assert(
    goldenAspects.some((item) => item.planet1 === "a" && item.planet2 === "b" && item.aspect === "conjunction" && item.orb === 2) &&
      goldenAspects.some((item) => item.planet1 === "a" && item.planet2 === "c" && item.aspect === "square" && item.orb === 0) &&
      goldenAspects.some((item) => item.planet1 === "a" && item.planet2 === "d" && item.aspect === "opposition" && item.orb === 0),
    "golden aspects cover wraparound conjunction, square, and opposition"
  );
  assert(parseTimingHorizon(7) === 7 && parseTimingHorizon("365") === 365, "timing accepts supported horizons");
  assert(parseTimingHorizon(8) === null && parseTimingHorizon("all") === null, "timing rejects unbounded horizons");
  const mappedAge = progressedInstantForTarget(
    new Date("2000-01-01T00:00:00.000Z"),
    new Date("2000-12-31T05:49:12.000Z")
  );
  assertNear(mappedAge.exactAgeYears, 1, 0.000001, "day-for-year exact age mapping");
  assert(
    mappedAge.progressedAtUtc.toISOString() === "2000-01-02T00:00:00.000Z",
    "one tropical year maps to one ephemeris day"
  );
  const orderedPeaks = sortTimingEvents([
    { id: "later", peakAtUtc: "2026-01-02T00:00:00Z", orb: 0.01 },
    { id: "wide", peakAtUtc: "2026-01-01T00:00:00Z", orb: 0.5 },
    { id: "exact", peakAtUtc: "2026-01-01T00:00:00Z", orb: 0.1 },
  ]);
  assert(
    orderedPeaks.map((event) => event.id).join(",") === "exact,wide,later",
    "timing peaks order by instant then orb"
  );
  const fixturePlace = { label: "UTC fixture", latitude: 0, longitude: 0, timezone: "UTC" };
  const fixtureNatal = {
    western: { sun: { longitude: 0 } },
    place: fixturePlace,
    timeKnown: true,
  };
  const peakMillis = {
    mars: Date.parse("2026-01-02T06:00:00.000Z"),
    sun: Date.parse("2026-01-03T06:00:00.000Z"),
    venus: Date.parse("2026-01-08T18:00:00.000Z"),
  };
  const fixtureSky = (at) => Object.fromEntries(
    Object.entries(peakMillis).map(([key, peak]) => [
      key,
      { longitude: ((at.getTime() - peak) / 86_400_000 + 360) % 360, retrograde: false },
    ])
  );
  const fixtureTimeline = await computeTransitTimeline({
    natal: fixtureNatal,
    horizon: 7,
    referenceDate: new Date("2026-01-01T00:00:00.000Z"),
    skyProvider: fixtureSky,
  });
  const conjunctions = fixtureTimeline.filter((event) =>
    event.kind === "aspect" && event.targetKey === "sun" && event.aspect === "conjunction"
  );
  assert(
    conjunctions.map((event) => event.planetKey).join(",") === "mars,sun,venus",
    "injectable transit fixtures prove chronological exact-peak ordering"
  );
  assert(
    conjunctions.every((event) =>
      Math.abs(Date.parse(event.peakAtUtc) - peakMillis[event.planetKey]) <= 30 * 60_000
    ),
    "transit peak refinement is within 30 minutes"
  );
  const boundaryEvent = conjunctions.find((event) => event.planetKey === "venus");
  assert(
    boundaryEvent?.windowEnd === "2026-01-08" &&
      Date.parse(boundaryEvent.peakAtUtc) > Date.parse("2026-01-08T12:00:00.000Z"),
    "horizon+1 sample closes an aspect crossing the final-day boundary"
  );
  const ingress = detectSignIngresses(
    { mars: { longitude: 30.1 } },
    { mars: { longitude: 29.9 } },
    "2026-07-14"
  );
  assert(ingress.length === 1 && ingress[0].kind === "sign_change", "synthetic Aries→Taurus ingress");

  const ny = await testCase("ny", {
    birthDate: "1990-06-15",
    birthTime: "14:30",
    birthCity: "New York",
    timeKnown: true,
  });

  assert(ny.western?.ephemeris === "celestine", "ny: celestine ephemeris");
  assert(typeof ny.western?.houseSystem === "string", "ny: house system label");
  assert(Array.isArray(ny.western?.houses) && ny.western.houses.length === 12, "ny: 12 house cusps");
  assert(Array.isArray(ny.western?.aspects) && ny.western.aspects.length > 0, "ny: aspects");
  assert(signName(ny.western?.sun) === "Gemini", "ny: sun in Gemini");
  assertNear(sunLongitude(ny), 84.39, 0.8, "ny: sun longitude");
  assertNear(
    typeof ny.western?.rising === "object" ? ny.western.rising.longitude : null,
    193.69,
    1.5,
    "ny: ascendant longitude"
  );
  assert(ny.vedic?.positions.rahu && ny.vedic?.positions.ketu, "ny: normalized Rahu and Ketu positions");
  assert(ny.vedic?.navamsa.rahu && ny.vedic?.navamsa.ketu, "ny: D9 includes Rahu and Ketu");
  assert(ny.vedic?.hasExactLagna === true, "ny: exact-time Vedic chart includes lagna");
  assert(Object.keys(ny.vedic?.houses ?? {}).length === 12, "ny: normalized 12 whole-sign houses");
  assert(ny.vedic?.dasha.dashas.length === 9, "ny: complete Vimshottari mahadasha timeline");
  assert(
    ny.vedic?.dasha.authoritative === true && ny.vedic.dasha.validationWarnings.length === 0,
    "ny: Vimshottari timeline passes local normalization validation"
  );
  const goodDasha = ny.vedic?.dasha;
  if (goodDasha) {
    const badSequence = {
      ...goodDasha,
      dashas: goodDasha.dashas.map((period, index) =>
        index === 1 ? { ...period, lord: goodDasha.dashas[0].lord } : period
      ),
    };
    assert(
      validateNormalizedVimshottari(badSequence, {
        moonNakshatraLord: ny.vedic?.moonSign.nakshatra.lord,
      }).some((warning) => warning.includes("NINE_UNIQUE")),
      "Vimshottari validation rejects duplicate/nonstandard lord sequence"
    );
    const badDates = {
      ...goodDasha,
      dashas: goodDasha.dashas.map((period, index) =>
        index === 2 ? { ...period, startDate: goodDasha.dashas[1].startDate } : period
      ),
      current: { ...goodDasha.current, endDate: "2000-01-01T00:00:00.000Z" },
    };
    const badDateWarnings = validateNormalizedVimshottari(badDates, {
      moonNakshatraLord: "not-the-moon-lord",
    });
    assert(
      badDateWarnings.some((warning) => warning.includes("DATES_OR_YEARS")) &&
        badDateWarnings.some((warning) => warning.includes("MOON_MISMATCH")) &&
        badDateWarnings.some((warning) => warning.includes("CURRENT_PERIOD")),
      "Vimshottari validation rejects bad dates, Moon lord, and current fixture"
    );
    const badPartial = {
      ...goodDasha,
      proportionElapsed: 0,
      yearsRemaining: 99,
    };
    assert(
      validateNormalizedVimshottari(badPartial, {
        moonNakshatraLord: ny.vedic?.moonSign.nakshatra.lord,
      }).some((warning) => warning.includes("PARTIAL_FIRST")),
      "Vimshottari validation rejects inconsistent partial first period"
    );
  }
  const evidenceA = buildNatalEvidence(ny);
  const evidenceB = buildNatalEvidence(ny);
  assert(
    evidenceA.map((item) => item.id).join("|") === evidenceB.map((item) => item.id).join("|"),
    "evidence IDs are stable and deterministic"
  );
  assert(
    new Set(evidenceA.map((item) => item.id)).size === evidenceA.length,
    "evidence IDs are unique"
  );
  const relationshipScope = scopeNatalEvidence(evidenceA, "Что происходит в отношениях?", 8);
  assert(
    relationshipScope.length <= 8 &&
      relationshipScope.every((item) => ["relationships", "emotions"].includes(item.category)),
    "Shri Raj evidence context is relevance-scoped"
  );
  const validReport = {
    version: "1.0",
    tradition: "western",
    reportType: "interpretation",
    sections: NATAL_REPORT_SECTION_KEYS.map((key) => {
      const category = {
        personality: ["identity", "emotions"],
        relationships: ["relationships", "emotions"],
        career: ["career", "identity"],
        resources: ["resources", "career"],
        tensions: ["tensions", "emotions"],
        currentPeriod: ["timing"],
      }[key];
      const citation = evidenceA.find((item) => !category || category.includes(item.category)) ?? evidenceA[0];
      return {
        key,
        title: key,
        claims: [{ text: `Проверяемый вывод: ${key}`, evidenceIds: [citation.id] }],
      };
    }),
    disclaimer: "Не научный прогноз.",
    methodology: "Только рассчитанные evidence.",
  };
  assert(validateNatalReport(validReport, evidenceA, "western").ok, "report schema accepts grounded report");
  const timingEvidence = {
    id: "ne.timing.transit.fixture",
    tradition: "timing",
    category: "timing",
    type: "transit",
    label: "Тестовый транзит",
    value: "Пик 2026-07-20",
    sourcePath: "timing.events.fixture",
    confidence: "high",
    uncertainty: null,
    deepLink: "/cabinet/astrology?tab=timing",
  };
  const forecastEvidence = [...evidenceA, timingEvidence];
  const validForecast = {
    ...validReport,
    reportType: "forecast",
    horizonDays: 30,
    sections: validReport.sections.map((section) => ({
      ...section,
      claims: section.claims.map((claim) => ({
        ...claim,
        evidenceIds: [timingEvidence.id, ...claim.evidenceIds],
      })),
    })),
  };
  const forecastWithServerMetadata = withReportMetadataDefaults(
    { ...validForecast, disclaimer: "", methodology: undefined },
    { disclaimer: "Серверное ограничение.", methodology: "Серверная методология." }
  );
  assert(
    validateNatalReport(
      forecastWithServerMetadata,
      forecastEvidence,
      "western",
      "forecast",
      30
    ).ok,
    "report schema accepts grounded forecast with server metadata defaults"
  );
  assert(
    !validateNatalReport(
      { ...validForecast, horizonDays: 90 },
      forecastEvidence,
      "western",
      "forecast",
      30
    ).ok,
    "report schema rejects a mismatched forecast horizon"
  );
  assert(
    !validateNatalReport(
      {
        ...validForecast,
        sections: validForecast.sections.map((section) =>
          section.key === "currentPeriod"
            ? {
                ...section,
                claims: [{
                  text: section.claims[0]?.text ?? "Период без timing.",
                  evidenceIds: [evidenceA.find((item) => item.tradition === "western")?.id ?? evidenceA[0].id],
                }],
              }
            : section
        ),
      },
      forecastEvidence,
      "western",
      "forecast",
      30
    ).ok,
    "report schema rejects forecast currentPeriod claims without timing evidence"
  );
  const forecastWithNatalPersonality = {
    ...validForecast,
    sections: validForecast.sections.map((section) =>
      section.key === "personality"
        ? {
            ...section,
            claims: [{ text: "Натальный акцент периода.", evidenceIds: [evidenceA[0].id] }],
          }
        : section
    ),
  };
  assert(
    validateNatalReport(
      forecastWithNatalPersonality,
      forecastEvidence,
      "western",
      "forecast",
      30
    ).ok,
    "report schema accepts forecast personality claims grounded in natal evidence"
  );
  assert(
    !validateNatalReport(
      {
        ...validReport,
        sections: validReport.sections.map((section, index) => index === 0
          ? { ...section, claims: [{ text: "", evidenceIds: ["ne.unknown"] }] }
          : section),
      },
      evidenceA,
      "western"
    ).ok,
    "report schema rejects empty claims and unknown citations"
  );
  const solarReturn = await computeSolarReturn({ natal: ny, birthDate: "1990-06-15", year: 2026 });
  const returnedSun = solarReturn.positions.find((position) => position.key === "sun")?.longitude;
  assert(
    returnedSun != null && sunLongitude(ny) != null &&
      angularSeparation(returnedSun, sunLongitude(ny)) < 0.001,
    "solar-return bisection finds natal Sun crossing"
  );
  assert(
    solarReturn.houses?.cusps?.length === 12 &&
      solarReturn.houses.ascendant?.key === "rising" &&
      solarReturn.houses.midheaven?.key === "midheaven" &&
      solarReturn.positions.every((position) => Number.isInteger(position.house)) &&
      solarReturn.location.assumption === "natal_place" &&
      solarReturn.resolutionSeconds === 1 &&
      !solarReturn.method.includes("Transit Sun root"),
    "solar return calculates Placidus houses and uses Russian methodology"
  );
  const progressions = await computeSecondaryProgressions({
    natal: ny,
    birthDate: "1990-06-15",
    birthTime: "14:30",
    targetDate: new Date("2026-07-14T00:00:00.000Z"),
  });
  assert(
    progressions.positions.some((position) => position.key === "moon") &&
      progressions.method.includes("2°–3°"),
    "secondary progressions include the Moon and document configured aspect orbs"
  );

  const planetHouses = ny.western?.planetHouses;
  const cusps = Array.isArray(ny.western?.houses)
    ? ny.western.houses.map((h) => h.longitude)
    : null;
  const sunLon = sunLongitude(ny);
  if (planetHouses && cusps && sunLon != null) {
    const expectedHouse = houseForLongitude(cusps, sunLon);
    assert(planetHouses.sun === expectedHouse, "ny: planetHouses.sun matches cusps");
  } else {
    failures.push("ny: planetHouses sanity skipped (missing data)");
  }

  const moscow = await testCase("moscow", {
    birthDate: "1985-03-20",
    birthTime: "08:15",
    birthCity: "Москва",
    timeKnown: true,
  });
  assert(signName(moscow.western?.sun) === "Pisces", "moscow: sun in Pisces");
  assertNear(sunLongitude(moscow), 359.0, 1.2, "moscow: sun longitude near 0° Aries/Pisces cusp");

  const unknownTime = await testCase("unknown-time", {
    birthDate: "1992-11-02",
    birthCity: "London",
    timeKnown: false,
  });
  assert(!unknownTime.vedic?.positions.ascendant, "unknown-time: D1 lagna excluded");
  assert(!unknownTime.vedic?.navamsa.ascendant, "unknown-time: D9 ascendant excluded");
  assert(unknownTime.vedic?.houses === null, "unknown-time: whole-sign houses excluded");
  const unknownEvidence = buildNatalEvidence(unknownTime);
  assert(
    unknownEvidence.every((item) =>
      item.type !== "house" &&
      !item.sourcePath.includes("rising") &&
      !item.sourcePath.includes("midheaven") &&
      !item.sourcePath.includes("ascendant")
    ),
    "unknown-time evidence excludes houses and angles"
  );

  const polar = await computeWesternChart({
    birthDate: "1990-06-15",
    localHourDecimal: 14.5,
    utcOffsetHours: 2,
    latitude: 69,
    longitude: 18.95,
    timeKnown: true,
  });
  assert(polar.houseSystem === "Porphyry", "polar latitude falls back to Porphyry");
  assert(
    Array.isArray(polar.houseWarnings) && polar.houseWarnings.length > 0,
    "polar fallback surfaces warning"
  );

  const moscowFallback = resolveFallbackCity("москва");
  assert(Boolean(moscowFallback?.timezone), "fallback city moscow");
  assert(searchFallbackCities("алм").length > 0, "fallback city search");

  assert(geonamesIndexLoaded(), "geonames index must be present");
  assert(searchGeonames("Novosibirsk").length > 0, "geonames search Novosibirsk");
  assert(searchGeonames("Казань").length > 0, "geonames search Казань");

  const syn = computeSynastry(ny, moscow);
  assert(syn != null && typeof syn.overallScore === "number", "synastry pair score");
  assert(Array.isArray(syn?.crossAspects), "synastry cross aspects");
  assert(
    JSON.stringify(computeSynastryDimensions(syn?.crossAspects ?? [])) ===
      JSON.stringify(computeSynastryDimensions([...(syn?.crossAspects ?? [])])),
    "synastry dimensions are deterministic"
  );
  assert(
    syn?.dimensions.length === 5 &&
      syn.dimensions.every((dimension) => dimension.index % 5 === 0),
    "synastry dimensions expose five no-false-precision indices"
  );
  assertNear(compositeMidpointLongitude(359, 1), 0, 0.000001, "composite wraparound 359°/1°");
  assertNear(compositeMidpointLongitude(1, 359), 0, 0.000001, "composite midpoint is symmetric");
  assertNear(compositeMidpointLongitude(0, 180), 90, 0.000001, "composite opposition policy");
  assertNear(compositeMidpointLongitude(180, 0), 90, 0.000001, "composite opposition policy symmetric");
  const syntheticComposite = computeCompositeChart(
    { sun: { longitude: 359 }, moon: { longitude: 0 }, planets: { venus: { longitude: 10 } } },
    { sun: { longitude: 1 }, moon: { longitude: 180 }, planets: { venus: { longitude: 190 } } }
  );
  assert(
    syntheticComposite.houses === null && syntheticComposite.angles === null &&
      syntheticComposite.oppositionPolicy === "lower-longitude-plus-90",
    "composite explicitly omits houses/angles and declares ambiguity policy"
  );
  const sanitizedSynastry = sanitizeSynastryForClient({
    ...syn,
    chartA: { label: "A", western: { ...syn?.chartA?.western, birth_lat: 55.7, place: { latitude: 55.7 } } },
    secret: "must-not-leak",
  });
  assert(
    sanitizedSynastry != null &&
      !JSON.stringify(sanitizedSynastry).includes("birth_lat") &&
      !JSON.stringify(sanitizedSynastry).includes("must-not-leak"),
    "synastry client sanitizer drops raw coordinates and unknown fields"
  );
  const scoreFixture = sanitizeSynastryForClient({
    ...syn,
    overallScore: 100,
    crossAspects: [{
      id: "ignored",
      bodyAKey: "sun",
      bodyBKey: "sun",
      aspect: "square",
      orb: 0,
      label: "square",
      strength: 1,
    }],
  });
  assert(
    scoreFixture?.overallScore === 43 &&
      scoreFixture.dimensions.every((dimension) => dimension.index === 50),
    "sanitized synastry score is recomputed while unrelated dimensions stay neutral"
  );
  const dimensionFixture = computeSynastryDimensions([{
    id: "moon:trine:moon",
    bodyAKey: "moon",
    bodyBKey: "moon",
    aspect: "trine",
    orb: 0,
    label: "trine",
    strength: 1,
  }]);
  assert(
    dimensionFixture.find((dimension) => dimension.key === "emotional")?.index === 60 &&
      dimensionFixture.find((dimension) => dimension.key === "communication")?.index === 50,
    "synastry dimension thresholds react only to relevant non-tautological fixtures"
  );
  assert(
    allowedShareSections("natal", ["summary", "sourcePath", "evidence", "summary"]).join(",") === "summary,evidence",
    "share sections enforce allowlist and uniqueness"
  );
  assert(isHighEntropyShareToken("a".repeat(43)) && !isHighEntropyShareToken("short"), "share token requires 256-bit base64url shape");
  const natalShare = sanitizeNatalReportShare({
    structuredData: validReport, content: "legacy", sections: ["summary", "evidence"],
    evidenceRefs: [{ ...evidenceA[0], sourcePath: "western.sun", deepLink: "/private" }],
    meta: { engineVersion: "test" },
  });
  assert(
    !JSON.stringify(natalShare).includes("sourcePath") && !JSON.stringify(natalShare).includes("/private"),
    "public natal share strips evidence source paths and deep links"
  );
  const relationshipShare = sanitizeRelationshipReportShare({
    synastry: syn, combinedReading: "summary", labels: { a: "A", b: "B" },
    sections: ["dimensions"], meta: {},
  });
  assert(
    Array.isArray(relationshipShare.dimensions) &&
      relationshipShare.summary === undefined && relationshipShare.composite === undefined,
    "relationship share returns selected sanitized sections only"
  );
  const compatibilityEvidence = buildCompatibilityEvidence(sanitizedSynastry);
  const compatibilityReport = {
    version: "1.0",
    sections: COMPATIBILITY_REPORT_SECTION_KEYS.map((key) => ({
      key,
      title: key,
      claims: [{
        text: `Раздел ${key} опирается на рассчитанный показатель совместимости и описывает его как символическую тенденцию, а не как гарантию. Этот фактор помогает заметить характер взаимодействия пары в соответствующей сфере, обсудить различия спокойно и выбрать практичный способ поддержки друг друга. Вывод относится только к указанному расчёту и требует личного контекста.`,
        evidenceIds: [`dimension:${key === "summary" || key === "recommendations" ? "growth" : key}`],
      }],
    })),
    disclaimer: "Не является гарантией развития отношений.",
  };
  const compatibilityValidation = validateCompatibilityReport(
    compatibilityReport,
    compatibilityEvidence
  );
  assert(compatibilityValidation.ok, "compatibility report accepts calculated evidence links");
  const invalidCompatibility = validateCompatibilityReport({
    ...compatibilityReport,
    sections: compatibilityReport.sections.map((section, index) => index === 0
      ? { ...section, claims: [{ text: "Invented", evidenceIds: ["private-coordinate"] }] }
      : section),
  }, compatibilityEvidence);
  assert(!invalidCompatibility.ok, "compatibility report rejects unknown evidence links");
  const compatibilityShare = sanitizeCompatibilityReportShare({
    report: compatibilityReport,
    evidence: compatibilityEvidence,
    synastry: { ...syn, birthDate: "1990-01-01", latitude: 55.7 },
    labels: { a: "A", b: "B" },
    sections: ["summary", "dimensions"],
    meta: {},
  });
  assert(
    !JSON.stringify(compatibilityShare).includes("1990-01-01") &&
      !JSON.stringify(compatibilityShare).includes("55.7") &&
      compatibilityShare.aspects === undefined,
    "compatibility share contains selected sanitized evidence only"
  );

  const prompt = buildNatalPromptBlock(ny);
  assert(prompt.includes("Placidus") || prompt.includes("placidus"), "prompt mentions house system");
  assert(prompt.includes("celestine"), "prompt mentions celestine");
  const vedicPrompt = buildNatalPromptBlock(ny, "vedic");
  assert(vedicPrompt.includes("Накшатра Луны: Purva Bhadrapada"), "vedic prompt reads moonSign.nakshatra");
  assert(vedicPrompt.includes("Текущая махадаша: Mercury"), "vedic prompt reads current dasha lord");
  assert(!vedicPrompt.includes("undefined"), "vedic prompt omits missing values");
  assert(vedicPrompt.includes("Положения:"), "vedic prompt includes concise positions");
  assert(vedicPrompt.includes("Занятые дома:"), "vedic prompt includes concise occupied houses");
  assert(buildNatalPromptBlock(null) === "", "null chart prompt empty");
  assert(
    !isNatalContextEnabled(
      { aiContextEnabled: false, tarotContextEnabled: true },
      "chat"
    ),
    "natal chat remains off when only tarot is enabled"
  );
  assert(
    isNatalContextEnabled(
      { aiContextEnabled: true, tarotContextEnabled: false },
      "chat"
    ),
    "natal chat turns on only with chat opt-in"
  );
  assert(
    !isNatalContextEnabled(
      { aiContextEnabled: true, tarotContextEnabled: false },
      "tarot"
    ),
    "natal tarot remains off when only chat is enabled"
  );
  assert(
    isNatalContextEnabled(
      { aiContextEnabled: false, tarotContextEnabled: true },
      "tarot"
    ),
    "natal tarot turns on only with tarot opt-in"
  );

  const presentedPositions = positionRows(ny.western, true);
  assert(presentedPositions.length >= 12, "workspace presents all western bodies and angles");
  assert(bigThree(ny.western, true).length === 3, "workspace derives Big Three");
  assert(aspectRows(ny.western).length === ny.western.aspects.length, "workspace preserves major and minor aspects");
  assert(methodology(ny.western, ny.engineVersion).source === "celestine", "workspace exposes ephemeris source");
  const unknownPositions = positionRows(ny.western, false);
  assert(
    unknownPositions.every((position) => position.house == null && position.key !== "rising" && position.key !== "midheaven"),
    "workspace suppresses time-dependent positions and houses"
  );

  const interpretationRoute = readFileSync(
    new URL("../src/app/api/natal-chart/interpretation/route.ts", import.meta.url),
    "utf8"
  );
  const natalService = readFileSync(
    new URL("../src/lib/services/natal-chart-service.ts", import.meta.url),
    "utf8"
  );
  const runeService = readFileSync(
    new URL("../src/lib/rune-service.ts", import.meta.url),
    "utf8"
  );
  const natalHistoryMigration = readFileSync(
    new URL("./migrations/064_migrate_natal_report_history.sql", import.meta.url),
    "utf8"
  );
  const natalHistoryRoute = readFileSync(
    new URL("../src/app/api/natal-chart/history/route.ts", import.meta.url),
    "utf8"
  );
  const astrologyWorkspace = readFileSync(
    new URL("../src/components/natal/AstrologyWorkspace.tsx", import.meta.url),
    "utf8"
  );
  const natalSettings = readFileSync(
    new URL("../src/components/natal/NatalSettings.tsx", import.meta.url),
    "utf8"
  );
  const natalCompatibility = readFileSync(
    new URL("../src/components/natal/NatalCompatibility.tsx", import.meta.url),
    "utf8"
  );
  const natalContext = readFileSync(
    new URL("../src/lib/prompts/natal-context.ts", import.meta.url),
    "utf8"
  );
  const chatOrchestrator = readFileSync(
    new URL("../src/lib/services/chat-orchestrator.ts", import.meta.url),
    "utf8"
  );
  const tarotReadingRoute = readFileSync(
    new URL("../src/app/api/reading/route.ts", import.meta.url),
    "utf8"
  );
  const aiPreferencesMigration = readFileSync(
    new URL("./migrations/066_migrate_natal_ai_preferences.sql", import.meta.url),
    "utf8"
  );
  const cabinetNatalSummary = readFileSync(
    new URL("../src/components/cabinet/CabinetNatalChart.tsx", import.meta.url),
    "utf8"
  );
  const interactiveWheel = readFileSync(
    new URL("../src/components/natal/NatalChartWheel.tsx", import.meta.url),
    "utf8"
  );
  const reportShareRoute = readFileSync(
    new URL("../src/app/api/report-shares/route.ts", import.meta.url), "utf8"
  );
  const reportRevokeRoute = readFileSync(
    new URL("../src/app/api/report-shares/[id]/route.ts", import.meta.url), "utf8"
  );
  const publicReportRoute = readFileSync(
    new URL("../src/app/api/public/reports/[token]/route.ts", import.meta.url), "utf8"
  );
  const sharedReportPage = readFileSync(
    new URL("../src/app/reports/shared/[token]/page.tsx", import.meta.url), "utf8"
  );
  const publicReportService = readFileSync(
    new URL("../src/lib/services/public-report-share-service.ts", import.meta.url), "utf8"
  );
  const natalTimingService = readFileSync(
    new URL("../src/lib/services/natal-timing-service.ts", import.meta.url), "utf8"
  );
  const natalTimingMigration = readFileSync(
    new URL("./migrations/065_migrate_natal_timing.sql", import.meta.url), "utf8"
  );
  const natalHardeningMigration = readFileSync(
    new URL("./migrations/068_harden_natal_backend.sql", import.meta.url), "utf8"
  );
  const schemaSql = readFileSync(
    new URL("../src/lib/schema.sql", import.meta.url), "utf8"
  );
  const printableReport = readFileSync(
    new URL("../src/components/natal/PrintableReport.tsx", import.meta.url), "utf8"
  );
  const natalExplainers = readFileSync(
    new URL("../src/lib/natal/explainers.ts", import.meta.url), "utf8"
  );
  const astrologyGuide = readFileSync(
    new URL("../src/components/natal/AstrologyGuide.tsx", import.meta.url), "utf8"
  );
  const vedicCharts = readFileSync(
    new URL("../src/components/natal/VedicCharts.tsx", import.meta.url), "utf8"
  );
  const natalLabels = readFileSync(
    new URL("../src/lib/natal/labels.ts", import.meta.url), "utf8"
  );
  const runeCosts = readFileSync(
    new URL("../src/lib/rune-costs.ts", import.meta.url), "utf8"
  );
  const claimCall = Math.max(
    interpretationRoute.indexOf("claimNatalInterpretation("),
    interpretationRoute.indexOf("claimNatalInterpretationResilient(")
  );
  const chargeCall = Math.max(
    interpretationRoute.indexOf("await BillingService.chargeRuneAction("),
    interpretationRoute.indexOf("await chargeRuneActionForWorkerJob(")
  );
  assert(claimCall >= 0 && chargeCall > claimCall, "interpretation route claims before charging");
  assert(
    interpretationRoute.includes("releaseNatalInterpretationClaim("),
    "interpretation route always has claim release"
  );
  assert(
    natalService.includes("INTERVAL '10 minutes'") &&
      natalService.includes("'claimedAtEpoch', EXTRACT(EPOCH FROM NOW())") &&
      natalService.includes("'token', $9::text") &&
      natalService.includes("engine_version = $4") &&
      natalService.includes("history.report_type = $6"),
    "service has version-bound expiring atomic interpretation claim"
  );
  assert(
    natalService.includes("IS NOT DISTINCT FROM EXCLUDED.chart_data #>> '{western,ephemeris}'") &&
      natalService.includes("'interpretationClaims', natal_charts.chart_data->'interpretationClaims'"),
    "chart upsert merges mutable fields only across matching engine inputs"
  );
  assert(
    natalService.includes("chart_data->>'birthFingerprint' = $5") &&
      natalService.includes("ARRAY['interpretationClaims', $4::text, 'token'] = $8") &&
      natalService.includes("FROM natal_charts") &&
      natalService.includes("FOR UPDATE"),
    "interpretation save checks fingerprint and claim ownership"
  );
  assert(
    natalService.includes("return withTransaction(async (client)") &&
      natalService.includes("INSERT INTO natal_report_history") &&
      natalService.includes("ON CONFLICT (") &&
      natalService.includes("natal_report_history_missing_after_insert") &&
      natalService.includes("natal_chart_claim_lost_during_save"),
    "report history and current chart save transactionally with row-missing checks"
  );
  const saveCall = interpretationRoute.indexOf("saveCurrentNatalInterpretation(");
  const staleRollback = interpretationRoute.indexOf("await rollback();", saveCall);
  const releaseCall = interpretationRoute.indexOf("releaseNatalInterpretationClaim(", saveCall);
  assert(
    saveCall > chargeCall && staleRollback > saveCall && releaseCall > staleRollback,
    "failed conditional save refunds before final claim release"
  );
  assert(
    interpretationRoute.includes("transactionId: charge.transactionId") &&
      runeService.includes("refund_of_transaction_id") &&
      runeService.includes("ON CONFLICT (refund_of_transaction_id)") &&
      natalHistoryMigration.includes("idx_rune_transactions_refund_once"),
    "paid natal rollback is database-idempotent by charge transaction"
  );
  assert(
    natalHistoryMigration.includes("natal_report_history_version_unique") &&
      natalHistoryMigration.includes("birth_fingerprint") &&
      natalHistoryMigration.includes("engine_version") &&
      natalHistoryMigration.includes("ephemeris") &&
      natalHistoryMigration.includes("charge_transaction_id") &&
      natalHistoryMigration.includes("ON CONFLICT ("),
    "migration versions and idempotently backfills paid natal report history"
  );
  assert(
    natalHistoryRoute.includes("requireProfileUserId()") &&
      natalHistoryRoute.includes("auth.profileUserId") &&
      natalService.includes("WHERE user_id = $1"),
    "history route scopes report reads to authenticated profile user"
  );
  assert(
    !natalService.includes("const previous = await getStoredNatalChart(userId)"),
    "chart recompute does not reattach stale TypeScript snapshots"
  );
  assert(
    astrologyWorkspace.includes('"overview"') &&
      (astrologyWorkspace.includes('"relationships"') ||
        astrologyWorkspace.includes('"compatibility"')) &&
      astrologyWorkspace.includes("/api/natal-chart/history"),
    "astrology workspace includes all sections and report history"
  );
  assert(
    chatOrchestrator.includes('purpose: "chat"') &&
      tarotReadingRoute.includes('purpose: "tarot"') &&
      natalContext.includes("isNatalContextEnabled(preferences, params.purpose)"),
    "all natal prompt callers declare a server-enforced purpose"
  );
  assert(
    /ai_context_enabled\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i.test(aiPreferencesMigration) &&
      /tarot_context_enabled\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i.test(aiPreferencesMigration) &&
      !/\bINSERT\s+INTO\s+natal_ai_preferences\b/i.test(aiPreferencesMigration),
    "chat and tarot consent migration defaults off without user backfill"
  );
  assert(
    natalSettings.includes("aiContextEnabled") &&
      natalSettings.includes("tarotContextEnabled") &&
      natalSettings.includes("/api/natal-chart/ai-preferences") &&
      natalSettings.includes("/api/natal-chart/event-preferences") &&
      astrologyWorkspace.includes("aiDataUseAcknowledged: true") &&
      interpretationRoute.indexOf("body.aiDataUseAcknowledged !== true") < chargeCall,
    "workspace exposes separate consent and acknowledges paid LLM data use before charge"
  );
  assert(
    cabinetNatalSummary.includes("window.location.assign") &&
      cabinetNatalSummary.includes("APP_SHELL_ROUTES.natalChart") &&
      cabinetNatalSummary.includes("Натальная карта") &&
      cabinetNatalSummary.includes("ritual-cta-banner") &&
      !cabinetNatalSummary.includes("<NatalChartWheel"),
    "cabinet renders compact astrology promo with working CTA"
  );
  assert(
    interactiveWheel.includes('tabIndex={0}') &&
      interactiveWheel.includes("Текстовая версия карты") &&
      interactiveWheel.includes("filterAspectNature"),
    "wheel includes keyboard interaction, text alternative, and filters"
  );
  assert(
    reportShareRoute.includes("owner_user_id") &&
      reportShareRoute.includes("user_id = $2") &&
      reportShareRoute.includes("initiator_user_id = $2 OR partner_user_id = $2"),
    "report share creation enforces owner/participant scope"
  );
  assert(
    reportRevokeRoute.includes("owner_user_id = $2") &&
      reportRevokeRoute.includes("revoked_at = COALESCE") &&
      publicReportRoute.includes("getActivePublicReportShare") &&
      publicReportService.includes("revoked_at IS NULL") &&
      publicReportService.includes("expires_at > NOW()"),
    "share revoke, owner scope, and expiry are enforced"
  );
  assert(
    sharedReportPage.includes("getActivePublicReportShare") &&
      !sharedReportPage.includes("next/headers") &&
      !/\bfetch\s*\(/.test(sharedReportPage) &&
      !/x-forwarded-proto|\.get\(\s*["']host["']\s*\)/i.test(sharedReportPage) &&
      publicReportService.includes("isHighEntropyShareToken"),
    "shared report SSR uses token-validated in-process lookup without request-derived origins"
  );
  assert(
    /const DEFAULT_PREFS[\s\S]*?enabled:\s*false/i.test(natalTimingService) &&
      /enabled BOOLEAN NOT NULL DEFAULT FALSE/i.test(natalTimingMigration) &&
      /SELECT user_id,\s*FALSE,/i.test(natalTimingMigration) &&
      /enabled BOOLEAN NOT NULL DEFAULT FALSE/i.test(schemaSql),
    "event notification preferences default off for new and backfilled users"
  );
  assert(
    /ALTER COLUMN enabled SET DEFAULT FALSE/i.test(natalHardeningMigration) &&
      /WHERE enabled = TRUE\s+AND updated_at = created_at/i.test(natalHardeningMigration),
    "hardening migration disables untouched legacy backfill without overriding explicit opt-ins"
  );
  assert(
    printableReport.includes("@media print") &&
      printableReport.includes('data-print-toc="true"') &&
      printableReport.includes('data-evidence-appendix="true"') &&
      printableReport.includes('data-legacy-printable="true"'),
    "print rendering has static TOC, evidence, legacy, and CSS markers"
  );
  assert(
    runeCosts.includes("NATAL_READING") &&
      runeCosts.includes("FORECAST_REPORT") &&
      runeCosts.includes("JOINT_READING"),
    "pricing exposes natal, forecast, and relationship action labels"
  );
  assert(
    ["overview", "western", "jyotish", "timing", "relationships", "reports"]
      .every((key) => natalExplainers.includes(`${key}: {`)) &&
      natalExplainers.includes("в астрологической традиции это связывают") &&
      natalExplainers.includes("может проявляться") &&
      !/гарантированно|неизбежно|обязательно произойдёт/i.test(natalExplainers),
    "plain-language explainers cover all workspace sections without fatalistic wording"
  );
  assert(
    astrologyGuide.includes("AstrologyGuide") &&
      astrologyGuide.includes("ExplainTerm") &&
      astrologyGuide.includes("PersonalMeaning") &&
      astrologyGuide.includes("SectionIntroduction") &&
      astrologyGuide.includes("<details"),
    "accessible reusable natal guide components provide progressive disclosure"
  );
  assert(
    natalLabels.includes("PLANET_LABELS") &&
      natalLabels.includes("GRAHA_LABELS") &&
      natalLabels.includes("TIMING_SOURCE_LABELS") &&
      natalLabels.includes("IMPORTANCE_PLANET_KEYS") &&
      !astrologyWorkspace.includes("} /> {planet}") &&
      !astrologyWorkspace.includes("{event.source}"),
    "visible natal UI uses reusable Russian labels instead of calculation keys"
  );
  assert(
    printableReport.includes("Приложение: расчётные данные") &&
      printableReport.includes("Основано на рассчитанных данных") &&
      !printableReport.includes("Evidence:") &&
      !astrologyWorkspace.includes('label="FORECAST_REPORT"') &&
      !astrologyWorkspace.includes("fingerprint {report.birthFingerprint}"),
    "report and print views hide English implementation labels and identifiers"
  );
  assert(
    ["Текущие транзиты", "Колесо", "Положения", "Аспекты и орб", "D1 и D9",
      "Шкала и фильтры", "Солнечное возвращение", "Вторичные прогрессии",
      "Текущая даша"]
      .every((title) => astrologyWorkspace.includes(`title="${title}"`)) &&
      natalSettings.includes("Уведомления о событиях") &&
      natalCompatibility.includes("Совместимость по двум натальным картам") &&
      vedicCharts.includes("D1 — основная карта") &&
      vedicCharts.includes("D9 — вспомогательная карта"),
    "all major natal panels include plain-language introductions"
  );
  assert(
    astrologyWorkspace.includes("Показать расчёт:") &&
      astrologyWorkspace.includes("полноты показывает") &&
      astrologyWorkspace.includes("не подтверждает истинность") &&
      natalSettings.includes("не создают прогноз") &&
      astrologyWorkspace.includes("асцендент D9 также исключён") &&
      astrologyWorkspace.includes('aria-label="Горизонт прогноза"'),
    "timing and evidence language remains calibrated and explicit about limits"
  );
  assert(
    astrologyWorkspace.includes("aiDataUseAcknowledged: true") &&
      !astrologyWorkspace.includes("Внешней языковой модели") &&
      !astrologyWorkspace.includes("координаты рождения исключены") &&
      natalSettings.includes("Контекст для Shri Raj") &&
      !natalSettings.includes("координаты рождения не передаются"),
    "paid natal reports no longer show external-model disclosure copy in the UI"
  );
  assert(
    astrologyWorkspace.includes("NATAL_GUIDES.overview") &&
      astrologyWorkspace.includes("NATAL_GUIDES.western") &&
      astrologyWorkspace.includes("NATAL_GUIDES.jyotish") &&
      astrologyWorkspace.includes("NATAL_GUIDES.timing") &&
      astrologyWorkspace.includes("NATAL_GUIDES.reports") &&
      astrologyWorkspace.includes("<NatalCompatibility") &&
      astrologyWorkspace.includes("explainPosition") &&
      astrologyWorkspace.includes("explainAspect") &&
      astrologyWorkspace.includes("explainGraha"),
    "workspace integrates beginner guides and calculated personal summaries"
  );

  if (failures.length) {
    console.error("verify:natal-chart FAILED");
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }

  console.log("verify:natal-chart OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
