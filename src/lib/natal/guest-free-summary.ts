import {
  aspectRows,
  asRecord,
  bigThree,
  positionRows,
  signLabel,
  signName,
  bodyFor,
} from "./presentation";
import type { NatalChartRecord } from "./types";

export type NatalGuestFreeHighlight = {
  title: string;
  text: string;
};

export type NatalGuestSafePayload = {
  artifactId: string;
  timeKnown: boolean;
  placeLabel: string;
  timezone: string;
  engineVersion: string;
  computedAt: string | null;
  expiresAt: string;
  western: Record<string, unknown> | null;
  bigThree: string[];
  positions: Array<{
    key: string;
    name: string;
    sign: string;
    degree: number | null;
    house: number | null;
  }>;
  majorAspects: Array<{
    first: string;
    second: string;
    label: string;
    orb: number | null;
  }>;
  highlights: NatalGuestFreeHighlight[];
  warnings: string[];
};

function sanitizeWesternForGuest(
  western: Record<string, unknown> | null,
  timeKnown: boolean
): Record<string, unknown> | null {
  if (!western) return null;
  const copy = { ...western };
  if (!timeKnown) {
    delete copy.rising;
    delete copy.midheaven;
    delete copy.houses;
    delete copy.planetHouses;
    if (typeof copy.bigThree === "string") {
      const sun = signName(bodyFor(copy, "sun"));
      const moon = signName(bodyFor(copy, "moon"));
      copy.bigThree = [sun && `${sun} Sun`, moon && `${moon} Moon`]
        .filter(Boolean)
        .join(", ");
    }
  }
  // Drop heavy / paid-adjacent / PII-adjacent fields if present.
  delete copy.interpretations;
  delete copy.interpretation;
  delete copy.birthFingerprint;
  delete copy.userId;
  return copy;
}

function buildHighlights(
  western: Record<string, unknown>,
  timeKnown: boolean
): NatalGuestFreeHighlight[] {
  const out: NatalGuestFreeHighlight[] = [];
  const sunSign = signName(bodyFor(western, "sun"));
  if (sunSign) {
    out.push({
      title: `Солнце в ${signLabel(sunSign)}`,
      text: "Ядро характера и способ проявлять себя — главный тон карты.",
    });
  }
  const moonSign = signName(bodyFor(western, "moon"));
  if (moonSign) {
    out.push({
      title: `Луна в ${signLabel(moonSign)}`,
      text: timeKnown
        ? "Эмоциональный ритм и то, что даёт ощущение опоры."
        : "Эмоциональный ритм (положение Луны чувствительно к точному времени).",
    });
  }
  if (timeKnown) {
    const risingSign = signName(bodyFor(western, "rising"));
    if (risingSign) {
      out.push({
        title: `Асцендент в ${signLabel(risingSign)}`,
        text: "Как вас считывают с первого взгляда и с чего начинается путь.",
      });
    }
  }
  const aspects = aspectRows(western)
    .filter((a) => ["conjunction", "opposition", "square", "trine", "sextile"].includes(a.type))
    .slice(0, 2);
  for (const a of aspects) {
    out.push({
      title: `${a.first} — ${a.label.toLowerCase()} — ${a.second}`,
      text: "Заметный аспект, который связывает две темы карты в одну динамику.",
    });
  }
  const saturn = asRecord(bodyFor(western, "saturn"));
  const saturnSign = signName(saturn);
  if (saturnSign && out.length < 5) {
    out.push({
      title: `Сатурн в ${signLabel(saturnSign)}`,
      text: "Зона дисциплины и долгосрочной ответственности.",
    });
  }
  return out.slice(0, 5);
}

/** Safe guest-facing payload — no claim hash, no user ids, no paid reports. */
export function buildNatalGuestSafePayload(opts: {
  artifactId: string;
  chart: NatalChartRecord;
  expiresAt: string;
}): NatalGuestSafePayload {
  const western = opts.chart.western;
  const timeKnown = opts.chart.timeKnown;
  const placeLabel = opts.chart.place?.label ?? "";
  const timezone = opts.chart.place?.timezone ?? "";
  const positions = western
    ? positionRows(western, timeKnown).map((p) => ({
        key: p.key,
        name: p.name,
        sign: p.sign,
        degree: p.degree,
        house: p.house,
      }))
    : [];
  const majorAspects = western
    ? aspectRows(western)
        .filter((a) =>
          ["conjunction", "opposition", "square", "trine", "sextile"].includes(a.type)
        )
        .slice(0, 8)
        .map((a) => ({
          first: a.first,
          second: a.second,
          label: a.label,
          orb: a.orb,
        }))
    : [];

  return {
    artifactId: opts.artifactId,
    timeKnown,
    placeLabel,
    timezone,
    engineVersion: opts.chart.engineVersion,
    computedAt: opts.chart.computedAt,
    expiresAt: opts.expiresAt,
    western: sanitizeWesternForGuest(western, timeKnown),
    bigThree: western ? bigThree(western, timeKnown) : [],
    positions,
    majorAspects,
    highlights: western ? buildHighlights(western, timeKnown) : [],
    warnings: (opts.chart.warnings ?? []).filter(
      (w) => !/claim|artifact|engine|hash|token|fingerprint/i.test(w)
    ),
  };
}
