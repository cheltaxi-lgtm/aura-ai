#!/usr/bin/env node
/**
 * Natal chart engine smoke + reference tests (no DB).
 * Run: npm run verify:natal-chart
 */
import { computeNatalChartRecord } from "../src/lib/natal/compute.ts";
import { buildNatalPromptBlock } from "../src/lib/natal/format-prompt.ts";
import { computeDeepTransits, detectSignIngresses } from "../src/lib/natal/transits.ts";
import { computeSynastry } from "../src/lib/natal/synastry.ts";
import { houseForLongitude } from "../src/lib/natal/math.ts";
import { toCelestineBirthData } from "../src/lib/natal/celestine/adapter.ts";
import { computeWesternChart } from "../src/lib/natal/western.ts";
import { addDaysInTimezone } from "../src/lib/natal/sky.ts";
import { searchFallbackCities, resolveFallbackCity } from "../src/lib/natal/cities-fallback.ts";
import { searchGeonames, geonamesIndexLoaded } from "../src/lib/natal/geonames.ts";
import { NATAL_ENGINE_VERSION } from "../src/lib/natal/types.ts";

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

  assert(
    addDaysInTimezone("Pacific/Kiritimati", "2026-07-14", 1) === "2026-07-15",
    "date-line calendar add stays one day"
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

  await testCase("unknown-time", {
    birthDate: "1992-11-02",
    birthCity: "London",
    timeKnown: false,
  });

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

  const prompt = buildNatalPromptBlock(ny);
  assert(prompt.includes("Placidus") || prompt.includes("placidus"), "prompt mentions house system");
  assert(prompt.includes("celestine"), "prompt mentions celestine");
  assert(buildNatalPromptBlock(null) === "", "null chart prompt empty");

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
