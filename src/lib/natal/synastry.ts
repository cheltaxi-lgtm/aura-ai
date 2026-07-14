import { angularSeparation } from "./math";
import { computeCompositeChart, sanitizeCompositeChart, type CompositeChart } from "./composite";
import type { NatalChartRecord } from "./types";

export const SYNASTRY_VERSION = "2.0" as const;
export type SynastryDimensionKey =
  | "communication"
  | "emotional"
  | "attraction"
  | "stability"
  | "growth";

export type SynastryCrossAspect = {
  id: string;
  bodyAKey: string;
  bodyBKey: string;
  aspect: string;
  orb: number;
  label: string;
  strength: number;
};

export type SynastryDimension = {
  key: SynastryDimensionKey;
  label: string;
  index: number;
  band: "напряжённо" | "смешанно" | "поддерживающе";
  supportingAspectIds: string[];
};

export type SynastrySummary = {
  version: typeof SYNASTRY_VERSION;
  overallScore: number;
  highlights: string[];
  crossAspects: SynastryCrossAspect[];
  dimensions: SynastryDimension[];
  composite: CompositeChart;
  chartA?: { label: string | null; western: Record<string, unknown> } | null;
  chartB?: { label: string | null; western: Record<string, unknown> } | null;
};

export type ClientSynastryPayload = SynastrySummary;

const BODY_KEYS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "rising"] as const;

const BODY_LABELS: Record<string, string> = {
  sun: "Солнце",
  moon: "Луна",
  mercury: "Меркурий",
  venus: "Венера",
  mars: "Марс",
  jupiter: "Юпитер",
  saturn: "Сатурн",
  rising: "Асцендент",
};

const BODY_WEIGHTS: Record<string, number> = {
  sun: 1.35,
  moon: 1.45,
  venus: 1.3,
  mars: 1.15,
  rising: 1.25,
  mercury: 1,
  jupiter: 0.9,
  saturn: 1,
};

const ASPECT_LABELS: Record<string, string> = {
  conjunction: "соединение",
  trine: "трин",
  sextile: "секстиль",
  square: "квадрат",
  opposition: "оппозиция",
};

const SYNASTRY_RULES: Array<{ name: string; angle: number; orb: number; score: number }> = [
  { name: "conjunction", angle: 0, orb: 8, score: 6 },
  { name: "trine", angle: 120, orb: 6, score: 5 },
  { name: "sextile", angle: 60, orb: 4, score: 4 },
  { name: "square", angle: 90, orb: 6, score: -5 },
  { name: "opposition", angle: 180, orb: 6, score: -4 },
];

const DIMENSIONS: Record<SynastryDimensionKey, {
  label: string;
  pairs: ReadonlyArray<readonly [string, string]>;
}> = {
  communication: {
    label: "Коммуникация",
    pairs: [["mercury", "mercury"], ["mercury", "sun"], ["mercury", "moon"], ["mercury", "jupiter"]],
  },
  emotional: {
    label: "Эмоциональная связь",
    pairs: [["moon", "moon"], ["moon", "sun"], ["moon", "venus"], ["moon", "saturn"]],
  },
  attraction: {
    label: "Притяжение",
    pairs: [["venus", "mars"], ["venus", "venus"], ["mars", "mars"], ["rising", "venus"], ["rising", "mars"]],
  },
  stability: {
    label: "Устойчивость",
    pairs: [["saturn", "sun"], ["saturn", "moon"], ["saturn", "venus"], ["saturn", "saturn"]],
  },
  growth: {
    label: "Рост",
    pairs: [["jupiter", "sun"], ["jupiter", "moon"], ["jupiter", "mercury"], ["jupiter", "venus"], ["jupiter", "saturn"]],
  },
};

function bodyLongitude(western: Record<string, unknown>, key: string): number | null {
  const body =
    key === "sun" || key === "moon" || key === "rising"
      ? western[key]
      : (western.planets as Record<string, unknown> | undefined)?.[key];
  if (!body || typeof body !== "object") return null;
  const lon = (body as { longitude?: number }).longitude;
  return typeof lon === "number" ? lon : null;
}

function collectBodies(western: Record<string, unknown>) {
  return BODY_KEYS.flatMap((key) => {
    const lon = bodyLongitude(western, key);
    return lon == null ? [] : [{ key, label: BODY_LABELS[key] ?? key, longitude: lon }];
  });
}

export function computeCrossAspects(
  chartA: Record<string, unknown>,
  chartB: Record<string, unknown>
): SynastryCrossAspect[] {
  const aBodies = collectBodies(chartA);
  const bBodies = collectBodies(chartB);
  const hits: SynastryCrossAspect[] = [];

  for (const a of aBodies) {
    for (const b of bBodies) {
      const sep = angularSeparation(a.longitude, b.longitude);
      for (const rule of SYNASTRY_RULES) {
        const orb = Math.abs(sep - rule.angle);
        if (orb > rule.orb) continue;
        hits.push({
          id: `${a.key}:${rule.name}:${b.key}`,
          bodyAKey: a.key,
          bodyBKey: b.key,
          aspect: rule.name,
          orb: Number(orb.toFixed(2)),
          label: `${a.label} — ${ASPECT_LABELS[rule.name] ?? rule.name} — ${b.label} (орб ${orb.toFixed(1)}°)`,
          strength: Number(Math.max(0, 1 - orb / rule.orb).toFixed(3)),
        });
        break;
      }
    }
  }

  return hits.sort((x, y) => x.orb - y.orb);
}

function scoreFromAspects(aspects: SynastryCrossAspect[]): number {
  let score = 50;
  for (const hit of aspects.slice(0, 16)) {
    const rule = SYNASTRY_RULES.find((r) => r.name === hit.aspect);
    if (!rule) continue;
    const closeness = Math.max(0.25, 1 - hit.orb / rule.orb);
    const bodyWeight =
      ((BODY_WEIGHTS[hit.bodyAKey] ?? 1) + (BODY_WEIGHTS[hit.bodyBKey] ?? 1)) / 2;
    score += rule.score * closeness * bodyWeight;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function pairMatches(hit: SynastryCrossAspect, pair: readonly [string, string]): boolean {
  return (
    (hit.bodyAKey === pair[0] && hit.bodyBKey === pair[1]) ||
    (hit.bodyAKey === pair[1] && hit.bodyBKey === pair[0])
  );
}

export function computeSynastryDimensions(
  aspects: readonly SynastryCrossAspect[]
): SynastryDimension[] {
  return (Object.entries(DIMENSIONS) as Array<
    [SynastryDimensionKey, (typeof DIMENSIONS)[SynastryDimensionKey]]
  >).map(([key, definition]) => {
    const relevant = aspects
      .filter((hit) => definition.pairs.some((pair) => pairMatches(hit, pair)))
      .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
      .slice(0, 6);
    let value = 50;
    for (const hit of relevant) {
      const rule = SYNASTRY_RULES.find((candidate) => candidate.name === hit.aspect);
      if (!rule) continue;
      value += rule.score * hit.strength * 2;
    }
    const index = Math.max(0, Math.min(100, Math.round(value / 5) * 5));
    return {
      key,
      label: definition.label,
      index,
      band: index >= 65 ? "поддерживающе" : index <= 35 ? "напряжённо" : "смешанно",
      supportingAspectIds: relevant.slice(0, 3).map((hit) => hit.id),
    };
  });
}

function wheelOnlyWestern(western: Record<string, unknown>): Record<string, unknown> {
  const planets: Record<string, unknown> = {};
  for (const key of BODY_KEYS) {
    if (key === "sun" || key === "moon") continue;
    const body = (western.planets as Record<string, unknown> | undefined)?.[key];
    if (body && typeof body === "object") {
      const lon = (body as { longitude?: number }).longitude;
      if (typeof lon === "number") {
        planets[key] = { longitude: lon };
      }
    }
  }
  const out: Record<string, unknown> = { planets };
  for (const key of ["sun", "moon", "rising"] as const) {
    const body = western[key];
    if (body && typeof body === "object") {
      const lon = (body as { longitude?: number }).longitude;
      if (typeof lon === "number") out[key] = { longitude: lon };
    }
  }
  return out;
}

export function computeSynastry(
  chartA: NatalChartRecord,
  chartB: NatalChartRecord,
  labels?: { a?: string | null; b?: string | null }
): SynastrySummary | null {
  if (!chartA.western || !chartB.western) return null;

  const crossAspects = computeCrossAspects(chartA.western, chartB.western);
  const overallScore = scoreFromAspects(crossAspects);
  const highlights = crossAspects.slice(0, 5).map((a) => a.label);
  if (highlights.length === 0) {
    highlights.push("Нейтральная синастрия — мало точных межкартных аспектов.");
  }

  return {
    version: SYNASTRY_VERSION,
    overallScore,
    highlights,
    crossAspects: crossAspects.slice(0, 16),
    dimensions: computeSynastryDimensions(crossAspects),
    composite: computeCompositeChart(chartA.western, chartB.western),
    chartA: {
      label: labels?.a ?? null,
      western: wheelOnlyWestern(chartA.western),
    },
    chartB: {
      label: labels?.b ?? null,
      western: wheelOnlyWestern(chartB.western),
    },
  };
}

export function sanitizeSynastryForClient(
  data: SynastrySummary | Record<string, unknown> | null | undefined
): ClientSynastryPayload | null {
  if (!data || typeof data !== "object") return null;

  const highlights = Array.isArray((data as SynastrySummary).highlights)
    ? (data as SynastrySummary).highlights.filter((item): item is string => typeof item === "string").slice(0, 6)
    : [];
  const rawAspects = Array.isArray((data as SynastrySummary).crossAspects)
    ? (data as SynastrySummary).crossAspects : [];
  const crossAspects = rawAspects.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const hit = item as Partial<SynastryCrossAspect>;
    if (
      typeof hit.bodyAKey !== "string" || !BODY_KEYS.includes(hit.bodyAKey as typeof BODY_KEYS[number]) ||
      typeof hit.bodyBKey !== "string" || !BODY_KEYS.includes(hit.bodyBKey as typeof BODY_KEYS[number]) ||
      typeof hit.aspect !== "string" || !SYNASTRY_RULES.some((rule) => rule.name === hit.aspect) ||
      typeof hit.orb !== "number" || !Number.isFinite(hit.orb)
    ) return [];
    const id = `${hit.bodyAKey}:${hit.aspect}:${hit.bodyBKey}`;
    return [{
      id,
      bodyAKey: hit.bodyAKey,
      bodyBKey: hit.bodyBKey,
      aspect: hit.aspect,
      orb: Math.max(0, Math.min(20, hit.orb)),
      label: typeof hit.label === "string" ? hit.label.slice(0, 160) : id,
      strength: typeof hit.strength === "number" ? Math.max(0, Math.min(1, hit.strength)) : 0,
    }];
  }).slice(0, 16);
  const dimensions = computeSynastryDimensions(crossAspects);

  const chartA = (data as SynastrySummary).chartA;
  const chartB = (data as SynastrySummary).chartB;

  return {
    version: SYNASTRY_VERSION,
    // The score and dimensions must describe the exact same sanitized aspect
    // set; never trust a persisted/client-supplied aggregate.
    overallScore: scoreFromAspects(crossAspects),
    highlights,
    crossAspects,
    dimensions,
    composite: sanitizeCompositeChart((data as SynastrySummary).composite),
    chartA: chartA?.western
      ? { label: chartA.label ?? null, western: wheelOnlyWestern(chartA.western) }
      : null,
    chartB: chartB?.western
      ? { label: chartB.label ?? null, western: wheelOnlyWestern(chartB.western) }
      : null,
  };
}
