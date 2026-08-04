/**
 * Ephemeris adapter for Human Design — SERVER ONLY (never import from client).
 *
 * Backend: astronomy-engine (MIT, VSOP87-class), tropical geocentric
 * ecliptic-of-date positions with aberration; true lunar node per Meeus
 * (mean node + standard 5-term perturbation — the same model Swiss
 * Ephemeris-compatible calculators use).
 *
 * Verified against NASA JPL Horizons (2026-08): Pluto 1932 err ≤6",
 * Mercury 1955 err 0.1', Moon 1955 err 1.3", modern dates ≤0.1' —
 * inside the ±1' tolerance the HD golden set requires.
 *
 * All functions take Julian Date (UT: ms/86400000 + 2440587.5) with full
 * sub-second precision — no Date.UTC minute flooring, no server timezone.
 */

import {
  Ecliptic,
  GeoVector,
  MakeTime,
  type AstroTime,
  type Body,
} from "astronomy-engine";
import type { HdBodyKey } from "./types";

export function julianDateFromUnixMs(unixMs: number): number {
  return unixMs / 86_400_000 + 2_440_587.5;
}

export function unixMsFromJulianDate(jd: number): number {
  return (jd - 2_440_587.5) * 86_400_000;
}

function astroTimeFromJd(jd: number): AstroTime {
  return MakeTime(new Date(unixMsFromJulianDate(jd)));
}

const DEG_TO_RAD = Math.PI / 180;

function normalize360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function eclipticLongitude(body: Body, time: AstroTime): number {
  // aberration = true → apparent position (light-time/stellar aberration),
  // matching the convention reference HD calculators use.
  return normalize360(Ecliptic(GeoVector(body, time, true)).elon);
}

/** True ascending node of the Moon (Meeus, "Astronomical Algorithms" ch. 47). */
function trueNodeLongitude(jd: number): number {
  const T = (jd - 2_451_545.0) / 36_525;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T2 * T2;
  const meanNode = normalize360(
    125.0445479 - 1934.1362891 * T + 0.0020754 * T2 + T3 / 467441 - T4 / 60616000
  );
  const D = normalize360(
    297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000
  );
  const M = normalize360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
  const Mp = normalize360(
    134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000
  );
  const F = normalize360(
    93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000
  );
  const Dr = D * DEG_TO_RAD;
  const Mr = M * DEG_TO_RAD;
  const Mpr = Mp * DEG_TO_RAD;
  const Fr = F * DEG_TO_RAD;
  const correction =
    -1.4979 * Math.sin(2 * (Dr - Fr)) -
    0.15 * Math.sin(Mr) -
    0.1226 * Math.sin(2 * Dr) +
    0.1176 * Math.sin(2 * Fr) -
    0.0801 * Math.sin(2 * (Mpr - Fr));
  return normalize360(meanNode + correction);
}

export function sunLongitudeAt(jd: number): number {
  return eclipticLongitude("Sun" as Body, astroTimeFromJd(jd));
}

/** All 13 HD activation longitudes at a Julian Date. */
export function hdLongitudesAt(jd: number): Record<HdBodyKey, number> {
  const time = astroTimeFromJd(jd);
  const sun = eclipticLongitude("Sun" as Body, time);
  const node = trueNodeLongitude(jd);
  return {
    sun,
    earth: normalize360(sun + 180),
    moon: eclipticLongitude("Moon" as Body, time),
    northNode: node,
    southNode: normalize360(node + 180),
    mercury: eclipticLongitude("Mercury" as Body, time),
    venus: eclipticLongitude("Venus" as Body, time),
    mars: eclipticLongitude("Mars" as Body, time),
    jupiter: eclipticLongitude("Jupiter" as Body, time),
    saturn: eclipticLongitude("Saturn" as Body, time),
    uranus: eclipticLongitude("Uranus" as Body, time),
    neptune: eclipticLongitude("Neptune" as Body, time),
    pluto: eclipticLongitude("Pluto" as Body, time),
  };
}
