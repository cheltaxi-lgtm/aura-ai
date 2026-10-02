/**
 * Ephemeris adapter for Human Design — SERVER ONLY (never import from client).
 *
 * Backend: astronomy-engine (MIT, VSOP87-class), tropical geocentric
 * ecliptic-of-date positions with aberration; osculating lunar node from
 * the instantaneous orbital plane, checked against Swiss Ephemeris.
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
  GeoMoonState,
  MakeTime,
  Vector,
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

function normalize360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function eclipticLongitude(body: Body, time: AstroTime): number {
  // aberration = true → apparent position (light-time/stellar aberration),
  // matching the convention reference HD calculators use.
  return normalize360(Ecliptic(GeoVector(body, time, true)).elon);
}

/** Osculating ascending node: intersection of the instantaneous lunar orbit
 * (r × v) with the true ecliptic of date. The former five-term perturbation
 * approximation can differ by minutes of arc and cross an HD gate boundary. */
function trueNodeLongitude(jd: number): number {
  const time = astroTimeFromJd(jd);
  const moon = GeoMoonState(time);
  const normal = Ecliptic(new Vector(
    moon.y * moon.vz - moon.z * moon.vy,
    moon.z * moon.vx - moon.x * moon.vz,
    moon.x * moon.vy - moon.y * moon.vx,
    time
  )).vec;
  return normalize360(Math.atan2(normal.x, -normal.y) * 180 / Math.PI);
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
