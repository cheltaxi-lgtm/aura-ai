import { midpointLongitude, signFromLongitude } from "./math";

export type NatalMidpoint = {
  planetA: string;
  planetB: string;
  longitude: number;
  sign: string;
  degree: number;
};

const MIDPOINT_PAIRS: Array<[string, string]> = [
  ["sun", "moon"],
  ["sun", "mercury"],
  ["sun", "venus"],
  ["sun", "mars"],
  ["moon", "venus"],
  ["mercury", "venus"],
  ["venus", "mars"],
  ["jupiter", "saturn"],
];

export function computeMidpoints(
  bodies: Record<string, { longitude: number }>
): NatalMidpoint[] {
  const out: NatalMidpoint[] = [];
  for (const [a, b] of MIDPOINT_PAIRS) {
    const bodyA = bodies[a];
    const bodyB = bodies[b];
    if (!bodyA || !bodyB) continue;
    const longitude = midpointLongitude(bodyA.longitude, bodyB.longitude);
    const sign = signFromLongitude(longitude);
    out.push({
      planetA: a,
      planetB: b,
      longitude,
      sign: sign.name,
      degree: Number(sign.degree.toFixed(2)),
    });
  }
  return out;
}
