import { angularSeparation, mod360, signFromLongitude } from "./math";

export const COMPOSITE_VERSION = "1.0" as const;
export const COMPOSITE_OPPOSITION_POLICY = "lower-longitude-plus-90" as const;

const BODY_KEYS = [
  "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
  "uranus", "neptune", "pluto", "chiron", "northNode",
] as const;

export type CompositeBodyKey = (typeof BODY_KEYS)[number];
export type CompositeBody = {
  key: CompositeBodyKey;
  longitude: number;
  sign: string;
  degree: number;
};
export type CompositeAspect = {
  id: string;
  firstKey: CompositeBodyKey;
  secondKey: CompositeBodyKey;
  aspect: "conjunction" | "sextile" | "square" | "trine" | "opposition";
  orb: number;
};
export type CompositePattern = {
  type: "grand-trine" | "t-square";
  bodyKeys: CompositeBodyKey[];
};
export type CompositeChart = {
  version: typeof COMPOSITE_VERSION;
  method: "shortest-arc-midpoint";
  oppositionPolicy: typeof COMPOSITE_OPPOSITION_POLICY;
  bodies: CompositeBody[];
  aspects: CompositeAspect[];
  patterns: CompositePattern[];
  houses: null;
  angles: null;
  limitation: string;
};

const ASPECT_RULES = [
  { aspect: "conjunction", angle: 0, orb: 7 },
  { aspect: "sextile", angle: 60, orb: 4 },
  { aspect: "square", angle: 90, orb: 6 },
  { aspect: "trine", angle: 120, orb: 6 },
  { aspect: "opposition", angle: 180, orb: 6 },
] as const;

function longitudeOf(western: Record<string, unknown>, key: CompositeBodyKey): number | null {
  const body = key === "sun" || key === "moon"
    ? western[key]
    : (western.planets as Record<string, unknown> | undefined)?.[key];
  const longitude = body && typeof body === "object"
    ? (body as { longitude?: unknown }).longitude
    : null;
  return typeof longitude === "number" && Number.isFinite(longitude) ? mod360(longitude) : null;
}

/**
 * Symmetric circular midpoint. Exact antipodes have two valid midpoints; this
 * implementation consistently chooses 90° after the lower normalized input.
 */
export function compositeMidpointLongitude(first: number, second: number): number {
  const a = mod360(first);
  const b = mod360(second);
  const separation = angularSeparation(a, b);
  if (Math.abs(separation - 180) < 1e-9) return mod360(Math.min(a, b) + 90);
  const x = Math.cos(a * Math.PI / 180) + Math.cos(b * Math.PI / 180);
  const y = Math.sin(a * Math.PI / 180) + Math.sin(b * Math.PI / 180);
  const midpoint = mod360(Math.atan2(y, x) * 180 / Math.PI);
  return midpoint > 360 - 1e-10 ? 0 : midpoint;
}

function computeAspects(bodies: readonly CompositeBody[]): CompositeAspect[] {
  const aspects: CompositeAspect[] = [];
  for (let firstIndex = 0; firstIndex < bodies.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < bodies.length; secondIndex += 1) {
      const first = bodies[firstIndex];
      const second = bodies[secondIndex];
      const separation = angularSeparation(first.longitude, second.longitude);
      const rule = ASPECT_RULES.find((candidate) =>
        Math.abs(separation - candidate.angle) <= candidate.orb
      );
      if (!rule) continue;
      aspects.push({
        id: `${first.key}:${rule.aspect}:${second.key}`,
        firstKey: first.key,
        secondKey: second.key,
        aspect: rule.aspect,
        orb: Number(Math.abs(separation - rule.angle).toFixed(2)),
      });
    }
  }
  return aspects.sort((a, b) => a.orb - b.orb || a.id.localeCompare(b.id));
}

function hasAspect(
  aspects: readonly CompositeAspect[],
  first: CompositeBodyKey,
  second: CompositeBodyKey,
  aspect: CompositeAspect["aspect"]
): boolean {
  return aspects.some((item) =>
    item.aspect === aspect &&
    ((item.firstKey === first && item.secondKey === second) ||
      (item.firstKey === second && item.secondKey === first))
  );
}

function computePatterns(
  bodies: readonly CompositeBody[],
  aspects: readonly CompositeAspect[]
): CompositePattern[] {
  const patterns: CompositePattern[] = [];
  for (let a = 0; a < bodies.length; a += 1) {
    for (let b = a + 1; b < bodies.length; b += 1) {
      for (let c = b + 1; c < bodies.length; c += 1) {
        const keys = [bodies[a].key, bodies[b].key, bodies[c].key] as const;
        if (
          hasAspect(aspects, keys[0], keys[1], "trine") &&
          hasAspect(aspects, keys[0], keys[2], "trine") &&
          hasAspect(aspects, keys[1], keys[2], "trine")
        ) patterns.push({ type: "grand-trine", bodyKeys: [...keys] });
        const oppositionPairs = [
          [keys[0], keys[1], keys[2]],
          [keys[0], keys[2], keys[1]],
          [keys[1], keys[2], keys[0]],
        ] as const;
        if (oppositionPairs.some(([left, right, apex]) =>
          hasAspect(aspects, left, right, "opposition") &&
          hasAspect(aspects, left, apex, "square") &&
          hasAspect(aspects, right, apex, "square")
        )) patterns.push({ type: "t-square", bodyKeys: [...keys] });
      }
    }
  }
  return patterns;
}

export function computeCompositeChart(
  chartA: Record<string, unknown>,
  chartB: Record<string, unknown>
): CompositeChart {
  const bodies = BODY_KEYS.flatMap((key): CompositeBody[] => {
    const first = longitudeOf(chartA, key);
    const second = longitudeOf(chartB, key);
    if (first == null || second == null) return [];
    const longitude = compositeMidpointLongitude(first, second);
    const sign = signFromLongitude(longitude);
    return [{ key, longitude: Number(longitude.toFixed(6)), sign: sign.name, degree: Number(sign.degree.toFixed(4)) }];
  });
  const aspects = computeAspects(bodies);
  return {
    version: COMPOSITE_VERSION,
    method: "shortest-arc-midpoint",
    oppositionPolicy: COMPOSITE_OPPOSITION_POLICY,
    bodies,
    aspects,
    patterns: computePatterns(bodies, aspects),
    houses: null,
    angles: null,
    limitation: "Композитные дома и углы не рассчитываются: выбранная midpoint-методика их не поддерживает.",
  };
}

export function sanitizeCompositeChart(value: unknown): CompositeChart {
  if (!value || typeof value !== "object") return computeCompositeChart({}, {});
  const root = value as Partial<CompositeChart>;
  const bodies = Array.isArray(root.bodies) ? root.bodies.flatMap((item): CompositeBody[] => {
    if (!item || typeof item !== "object") return [];
    const body = item as Partial<CompositeBody>;
    if (!BODY_KEYS.includes(body.key as CompositeBodyKey) || typeof body.longitude !== "number") return [];
    const longitude = mod360(body.longitude);
    const sign = signFromLongitude(longitude);
    return [{ key: body.key as CompositeBodyKey, longitude, sign: sign.name, degree: sign.degree }];
  }) : [];
  const safe = computeCompositeChart(
    Object.fromEntries(bodies.filter((body) => body.key === "sun" || body.key === "moon").map((body) => [body.key, body])),
    Object.fromEntries(bodies.filter((body) => body.key === "sun" || body.key === "moon").map((body) => [body.key, body]))
  );
  const aspects = computeAspects(bodies);
  return { ...safe, bodies, aspects, patterns: computePatterns(bodies, aspects) };
}
