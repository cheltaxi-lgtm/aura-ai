import { Body, Ecliptic, GeoVector } from "astronomy-engine";
import type { BirthData } from "celestine";
import type { SkyBody } from "./celestine/adapter";

const BODIES = { sun: Body.Sun, moon: Body.Moon, mercury: Body.Mercury, venus: Body.Venus,
  mars: Body.Mars, jupiter: Body.Jupiter, saturn: Body.Saturn, uranus: Body.Uranus,
  neptune: Body.Neptune, pluto: Body.Pluto } as const;
const wrap = (degrees: number) => (degrees % 360 + 360) % 360;
const signed = (degrees: number) => wrap(degrees + 180) - 180;

/** Apparent geocentric longitude, true ecliptic/equinox of date, with light time and aberration. */
export function computeNatalSkyAtUtc(date: Date): Record<string, SkyBody> {
  return Object.fromEntries(Object.entries(BODIES).map(([key, body]) => {
    const longitude = wrap(Ecliptic(GeoVector(body, date, true)).elon);
    const before = Ecliptic(GeoVector(body, new Date(date.getTime() - 864_000), true)).elon;
    const after = Ecliptic(GeoVector(body, new Date(date.getTime() + 864_000), true)).elon;
    return [key, { longitude, retrograde: signed(after - before) < 0 }];
  }));
}

export function computeNatalSky(birth: BirthData): Record<string, SkyBody> {
  const instant = Date.UTC(birth.year, birth.month - 1, birth.day, birth.hour, birth.minute, birth.second ?? 0) - birth.timezone * 3_600_000;
  return computeNatalSkyAtUtc(new Date(instant));
}
