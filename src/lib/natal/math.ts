/** Shared angle math for natal modules. */

export const OBLIQUITY = 23.4392911;

export function mod360(deg: number): number {
  let v = deg % 360;
  if (v < 0) v += 360;
  return v;
}

export function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function radToDeg(r: number): number {
  return (r * 180) / Math.PI;
}

export function sinDeg(d: number): number {
  return Math.sin(degToRad(d));
}

export function cosDeg(d: number): number {
  return Math.cos(degToRad(d));
}

export function tanDeg(d: number): number {
  return Math.tan(degToRad(d));
}

export function angularSeparation(lon1: number, lon2: number): number {
  const diff = Math.abs(mod360(lon1) - mod360(lon2));
  return diff > 180 ? 360 - diff : diff;
}

export function midpointLongitude(lon1: number, lon2: number): number {
  const a = mod360(lon1);
  const b = mod360(lon2);
  let diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return mod360(a + diff / 2);
}

const SIGNS_EN = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

export function signFromLongitude(longitude: number): { name: string; index: number; degree: number } {
  const lon = mod360(longitude);
  const index = Math.floor(lon / 30) % 12;
  return { name: SIGNS_EN[index], index, degree: lon % 30 };
}

export function houseForLongitude(cusps: number[], longitude: number): number {
  if (
    cusps.length !== 12 ||
    cusps.some((cusp) => !Number.isFinite(cusp)) ||
    !Number.isFinite(longitude)
  ) {
    throw new Error("INVALID_HOUSE_CUSPS");
  }
  const lon = mod360(longitude);
  for (let h = 1; h <= 12; h++) {
    const start = mod360(cusps[h - 1]);
    const end = mod360(cusps[h % 12]);
    if (start <= end) {
      if (lon >= start && lon < end) return h;
    } else if (lon >= start || lon < end) {
      return h;
    }
  }
  throw new Error("LONGITUDE_OUTSIDE_HOUSES");
}
