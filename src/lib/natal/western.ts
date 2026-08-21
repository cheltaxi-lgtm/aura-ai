/** Western chart assembly (Celestine MIT + Placidus). Server-side only. */

import { calculatePlanets, calculateHouseCusps } from "celestine";
import { dateToJulianDay } from "natalengine/astronomy";
import { computeAspects } from "./aspects";
import { formatHouseCusps } from "./houses";
import { houseForLongitude, signFromLongitude } from "./math";
import { computeMidpoints } from "./midpoints";
import { toCelestineBirthData } from "./celestine/adapter";
import { detectPatterns } from "./patterns";

function formatBody(longitude: number, retrograde = false) {
  const sign = signFromLongitude(longitude);
  return {
    sign: { name: sign.name },
    degree: Number(sign.degree.toFixed(2)),
    longitude,
    retrograde,
  };
}

const BODY_TO_KEY: Record<string, string> = {
  Sun: "sun",
  Moon: "moon",
  Mercury: "mercury",
  Venus: "venus",
  Mars: "mars",
  Jupiter: "jupiter",
  Saturn: "saturn",
  Uranus: "uranus",
  Neptune: "neptune",
  Pluto: "pluto",
};

const CHART_OPTIONS = {
  includeAsteroids: false,
  includeChiron: false,
  includeLilith: false,
  includeNodes: false,
} as const;

export async function computeWesternChart(params: {
  birthDate: string;
  localHourDecimal: number;
  utcOffsetHours: number;
  latitude: number;
  longitude: number;
  timeKnown: boolean;
}): Promise<Record<string, unknown>> {
  const birth = toCelestineBirthData(params);
  const planetsRaw = calculatePlanets(birth, CHART_OPTIONS);
  const { houses: houseBlock, angles, warnings: houseWarnings } = calculateHouseCusps(birth, {
    houseSystem: "placidus",
  });

  const cuspLongitudes = houseBlock.cusps.map((c) => c.longitude);
  const houses = formatHouseCusps(cuspLongitudes);

  const positions: Partial<Record<string, { longitude: number; retrograde: boolean }>> = {};
  for (const p of planetsRaw) {
    const key = BODY_TO_KEY[p.body] ?? BODY_TO_KEY[p.name];
    if (!key) continue;
    positions[key] = { longitude: p.longitude, retrograde: p.isRetrograde };
  }

  const ascLon = angles.ascendant.longitude;
  const mcLon = angles.midheaven.longitude;

  const sun = positions.sun ? formatBody(positions.sun.longitude, positions.sun.retrograde) : null;
  const moon = positions.moon ? formatBody(positions.moon.longitude, positions.moon.retrograde) : null;
  const rising = formatBody(ascLon);
  const midheaven = formatBody(mcLon);

  const planetKeys = [
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
  ] as const;

  const planets: Record<string, ReturnType<typeof formatBody>> = {};
  const aspectBodies: Array<{ id: string; longitude: number }> = [];

  if (sun) aspectBodies.push({ id: "sun", longitude: sun.longitude });
  if (moon) aspectBodies.push({ id: "moon", longitude: moon.longitude });

  for (const key of planetKeys) {
    const p = positions[key];
    if (!p) continue;
    const body = formatBody(p.longitude, p.retrograde);
    planets[key] = body;
    aspectBodies.push({ id: key, longitude: body.longitude });
  }

  const aspects = computeAspects(aspectBodies);
  const midpointBodies = Object.fromEntries(
    aspectBodies.map((b) => [b.id, { longitude: b.longitude }])
  );
  const midpoints = computeMidpoints(midpointBodies);
  const patterns = detectPatterns(aspects);

  const planetHouses: Record<string, number> = {};
  for (const b of aspectBodies) {
    planetHouses[b.id] = houseForLongitude(cuspLongitudes, b.longitude);
  }

  const sunSign = sun?.sign?.name ?? "?";
  const moonSign = moon?.sign?.name ?? "?";
  const risingSign = rising.sign.name;

  const [y, m, d] = params.birthDate.split("-").map(Number);
  const utHour = params.localHourDecimal - params.utcOffsetHours;
  const jd = dateToJulianDay(y, m, d, utHour);

  const chart: Record<string, unknown> = {
    ephemeris: "celestine",
    houseSystem: houseBlock.systemName,
    sun,
    moon,
    rising,
    midheaven,
    planets,
    houses,
    planetHouses,
    aspects,
    patterns,
    midpoints,
    bigThree: `${sunSign} Sun, ${moonSign} Moon, ${risingSign} Rising`,
    julianDay: jd,
    houseWarnings,
  };
  return params.timeKnown ? chart : stripUnreliableAngles(chart);
}

/**
 * Technical-noon ASC/MC/houses are not product facts. Drop them from the
 * canonical western payload whenever birth time is unknown.
 */
export function stripUnreliableAngles(western: Record<string, unknown>): Record<string, unknown> {
  const { rising: _r, midheaven: _m, houses: _h, planetHouses: _ph, ...rest } = western;
  const sunSign = (rest.sun as { sign?: { name?: string } } | null | undefined)?.sign?.name ?? "?";
  const moonSign = (rest.moon as { sign?: { name?: string } } | null | undefined)?.sign?.name ?? "?";
  return {
    ...rest,
    bigThree: `${sunSign} Sun, ${moonSign} Moon`,
    houseWarnings: [
      ...(Array.isArray(rest.houseWarnings) ? rest.houseWarnings.filter((item): item is string => typeof item === "string") : []),
      "Время рождения неизвестно — асцендент, MC и дома не включены в расчёт.",
    ],
  };
}

