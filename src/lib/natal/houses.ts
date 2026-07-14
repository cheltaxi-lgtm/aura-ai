import { signFromLongitude } from "./math";

export type HouseCusp = {
  house: number;
  longitude: number;
  sign: string;
  degree: number;
};

export function formatHouseCusps(cusps12: number[]): HouseCusp[] {
  return cusps12.map((longitude, idx) => {
    const sign = signFromLongitude(longitude);
    return { house: idx + 1, longitude, sign: sign.name, degree: sign.degree };
  });
}
