import { angularSeparation } from "./math";
import type { NatalChartRecord } from "./types";

export type SynastryCrossAspect = {
  bodyAKey: string;
  bodyBKey: string;
  aspect: string;
  orb: number;
  label: string;
};

export type SynastrySummary = {
  overallScore: number;
  highlights: string[];
  crossAspects: SynastryCrossAspect[];
  chartA?: { label: string | null; western: Record<string, unknown> } | null;
  chartB?: { label: string | null; western: Record<string, unknown> } | null;
};

export type ClientSynastryPayload = {
  overallScore: number;
  highlights: string[];
  crossAspects: SynastryCrossAspect[];
  chartA?: { label: string | null; western: Record<string, unknown> } | null;
  chartB?: { label: string | null; western: Record<string, unknown> } | null;
};

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

function computeCrossAspects(
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
          bodyAKey: a.key,
          bodyBKey: b.key,
          aspect: rule.name,
          orb: Number(orb.toFixed(2)),
          label: `${a.label} — ${ASPECT_LABELS[rule.name] ?? rule.name} — ${b.label} (орб ${orb.toFixed(1)}°)`,
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
    overallScore,
    highlights,
    crossAspects: crossAspects.slice(0, 16),
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

  const overallScore =
    typeof (data as SynastrySummary).overallScore === "number"
      ? (data as SynastrySummary).overallScore
      : 0;
  const highlights = Array.isArray((data as SynastrySummary).highlights)
    ? (data as SynastrySummary).highlights.slice(0, 6)
    : [];
  const crossAspects = Array.isArray((data as SynastrySummary).crossAspects)
    ? (data as SynastrySummary).crossAspects.slice(0, 16)
    : [];

  const chartA = (data as SynastrySummary).chartA;
  const chartB = (data as SynastrySummary).chartB;

  return {
    overallScore,
    highlights,
    crossAspects,
    chartA: chartA?.western
      ? { label: chartA.label ?? null, western: wheelOnlyWestern(chartA.western) }
      : null,
    chartB: chartB?.western
      ? { label: chartB.label ?? null, western: wheelOnlyWestern(chartB.western) }
      : null,
  };
}
