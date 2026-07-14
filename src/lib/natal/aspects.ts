import { angularSeparation, mod360 } from "./math";

export type NatalAspect = {
  planet1: string;
  planet2: string;
  aspect: string;
  angle: number;
  orb: number;
  nature: "major" | "minor";
};

const MAJOR: Array<{ name: string; angle: number; orb: number }> = [
  { name: "conjunction", angle: 0, orb: 8 },
  { name: "sextile", angle: 60, orb: 6 },
  { name: "square", angle: 90, orb: 7 },
  { name: "trine", angle: 120, orb: 7 },
  { name: "opposition", angle: 180, orb: 8 },
];

const MINOR: Array<{ name: string; angle: number; orb: number }> = [
  { name: "semi-sextile", angle: 30, orb: 2 },
  { name: "quincunx", angle: 150, orb: 2 },
];

export function computeAspects(
  bodies: Array<{ id: string; longitude: number }>
): NatalAspect[] {
  const hits: NatalAspect[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const sep = angularSeparation(bodies[i].longitude, bodies[j].longitude);
      for (const rule of [...MAJOR, ...MINOR]) {
        const orb = Math.abs(sep - rule.angle);
        if (orb <= rule.orb) {
          hits.push({
            planet1: bodies[i].id,
            planet2: bodies[j].id,
            aspect: rule.name,
            angle: mod360(sep),
            orb: Number(orb.toFixed(2)),
            nature: MAJOR.some((m) => m.name === rule.name) ? "major" : "minor",
          });
          break;
        }
      }
    }
  }
  return hits.sort((a, b) => a.orb - b.orb);
}
