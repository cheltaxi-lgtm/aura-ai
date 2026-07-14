import {
  ASPECT_NAMES,
  asRecord,
  bodyFor,
  signLabel,
  signName,
} from "./presentation";
import { russianGrahaLabel, russianPlanetLabel } from "./labels";
import type { PersonalTimingResult } from "./timing";
import type { NatalChartRecord, NatalTradition } from "./types";
import { evidenceAnchorId } from "./evidence-anchor";

export type NatalEvidenceCategory =
  | "identity" | "emotions" | "relationships" | "career" | "resources"
  | "tensions" | "timing" | "methodology";
export type NatalEvidenceType =
  | "position" | "house" | "aspect" | "pattern" | "nakshatra" | "dasha"
  | "transit" | "solar_return" | "progression";

export interface NatalEvidence {
  id: string;
  tradition: NatalTradition | "timing";
  category: NatalEvidenceCategory;
  type: NatalEvidenceType;
  label: string;
  value: string;
  sourcePath: string;
  confidence: "high" | "medium" | "low";
  uncertainty: string | null;
  deepLink: string;
}

const PLANET_CATEGORY: Record<string, NatalEvidenceCategory> = {
  sun: "identity", moon: "emotions", mercury: "career", venus: "relationships",
  mars: "career", jupiter: "resources", saturn: "tensions", uranus: "tensions",
  neptune: "tensions", pluto: "tensions", rahu: "tensions", ketu: "tensions",
  rising: "identity", midheaven: "career", ascendant: "identity",
};

function timingCategory(value: string): NatalEvidenceCategory {
  if (value === "growth") return "resources";
  if (value === "pressure" || value === "transformation") return "tensions";
  return (["identity", "emotions", "relationships", "career"].includes(value)
    ? value
    : "timing") as NatalEvidenceCategory;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "");
}

function stableId(tradition: NatalEvidence["tradition"], type: NatalEvidenceType, key: string): string {
  return `ne.${tradition}.${type}.${slug(key)}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function degree(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? ` · ${value.toFixed(2)}°` : "";
}

export function buildNatalEvidence(
  chart: NatalChartRecord,
  options: { tradition?: NatalTradition; timing?: PersonalTimingResult | null } = {}
): NatalEvidence[] {
  const evidence: NatalEvidence[] = [];
  const includeWestern = options.tradition !== "vedic";
  const includeVedic = options.tradition !== "western";

  if (includeWestern && chart.western) {
    const western = chart.western;
    const houses = asRecord(western.planetHouses);
    const keys = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "rising", "midheaven"];
    for (const key of keys) {
      if (!chart.timeKnown && (key === "rising" || key === "midheaven")) continue;
      const body = asRecord(bodyFor(western, key));
      const sign = signName(body);
      if (!body || !sign) continue;
      evidence.push({
        id: stableId("western", "position", key),
        tradition: "western",
        category: PLANET_CATEGORY[key] ?? "identity",
        type: "position",
        label: russianPlanetLabel(key),
        value: `${signLabel(sign)}${degree(body.degree)}${body.retrograde === true ? " · ретроградно" : ""}`,
        sourcePath: key === "sun" || key === "moon" || key === "rising" || key === "midheaven"
          ? `western.${key}` : `western.planets.${key}`,
        confidence: chart.timeKnown || !["moon"].includes(key) ? "high" : "medium",
        uncertainty: !chart.timeKnown && key === "moon"
          ? "Без времени рождения положение Луны может иметь дополнительную погрешность."
          : null,
        deepLink: `/cabinet/astrology?tab=western#${evidenceAnchorId("planet", key)}`,
      });
      const house = houses?.[key];
      if (chart.timeKnown && typeof house === "number") {
        evidence.push({
          id: stableId("western", "house", key),
          tradition: "western",
          category: PLANET_CATEGORY[key] ?? "identity",
          type: "house",
          label: `${russianPlanetLabel(key)} · дом`,
          value: `${house} дом`,
          sourcePath: `western.planetHouses.${key}`,
          confidence: "high",
          uncertainty: null,
          deepLink: `/cabinet/astrology?tab=western#${evidenceAnchorId("planet", key)}`,
        });
      }
    }
    if (Array.isArray(western.aspects)) {
      for (const raw of western.aspects) {
        const aspect = asRecord(raw);
        if (!aspect || typeof aspect.planet1 !== "string" || typeof aspect.planet2 !== "string" || typeof aspect.aspect !== "string") continue;
        const pair = [aspect.planet1, aspect.planet2].sort();
        const key = `${pair[0]}-${aspect.aspect}-${pair[1]}`;
        evidence.push({
          id: stableId("western", "aspect", key),
          tradition: "western",
          category: aspect.nature === "hard" ? "tensions" : "relationships",
          type: "aspect",
          label: `${russianPlanetLabel(aspect.planet1)} — ${russianPlanetLabel(aspect.planet2)}`,
          value: `${ASPECT_NAMES[aspect.aspect] ?? "Неуказанный аспект"}${degree(aspect.orb)}`,
          sourcePath: `western.aspects.${key}`,
          confidence: "high",
          uncertainty: null,
          deepLink: `/cabinet/astrology?tab=western#${evidenceAnchorId("aspect", key)}`,
        });
      }
    }
  }

  if (includeVedic && chart.vedic) {
    const vedic = chart.vedic;
    for (const [key, position] of Object.entries(vedic.positions)) {
      if (!position || (!chart.timeKnown && key === "ascendant")) continue;
      evidence.push({
        id: stableId("vedic", "position", key),
        tradition: "vedic",
        category: PLANET_CATEGORY[key] ?? "identity",
        type: "position",
        label: russianGrahaLabel(key),
        value: `${position.rashi.name} (${signLabel(position.rashi.westernName)}) · ${position.degree}`,
        sourcePath: `vedic.positions.${key}`,
        confidence: chart.timeKnown || key !== "moon" ? "high" : "medium",
        uncertainty: !chart.timeKnown && key === "moon" ? "Время рождения неизвестно." : null,
        deepLink: `/cabinet/astrology?tab=jyotish#${evidenceAnchorId("vedic", key)}`,
      });
    }
    evidence.push({
      id: stableId("vedic", "nakshatra", "moon"),
      tradition: "vedic",
      category: "emotions",
      type: "nakshatra",
      label: "Накшатра Луны",
      value: `${vedic.moonSign.nakshatra.name} · пада ${vedic.moonSign.nakshatra.pada} · ${russianGrahaLabel(vedic.moonSign.nakshatra.lord)}`,
      sourcePath: "vedic.moonSign.nakshatra",
      confidence: chart.timeKnown ? "high" : "medium",
      uncertainty: chart.timeKnown ? null : "Граница накшатры чувствительна к неизвестному времени рождения.",
      deepLink: "/cabinet/astrology?tab=jyotish#vedic-moon",
    });
    if (vedic.dasha.current) {
      const current = vedic.dasha.current;
      evidence.push({
        id: stableId("vedic", "dasha", `${current.lord}-${current.startDate.slice(0, 10)}`),
        tradition: "vedic",
        category: "timing",
        type: "dasha",
        label: "Текущая махадаша",
        value: `${russianGrahaLabel(current.lord)} · ${current.startDate.slice(0, 10)} — ${current.endDate.slice(0, 10)}`,
        sourcePath: "vedic.dasha.current",
        confidence: chart.timeKnown ? "high" : "low",
        uncertainty: chart.timeKnown ? null : "Период даши чувствителен к неизвестному времени рождения.",
        deepLink: "/cabinet/astrology?tab=timing#current-dasha",
      });
    }
  }

  const timing = options.timing;
  if (timing) {
    for (const event of timing.events.slice(0, 24)) {
      const subject = event.kind === "ingress"
        ? `${russianPlanetLabel(event.planetKey)}: ${event.previousSign ?? "знак не указан"} → ${event.sign ?? "знак не указан"}`
        : `${russianPlanetLabel(event.planetKey)} · ${ASPECT_NAMES[event.aspect ?? ""] ?? "аспект не указан"} · ${russianPlanetLabel(event.targetKey ?? "")}`;
      evidence.push({
        id: stableId("timing", "transit", event.id),
        tradition: "timing",
        category: timingCategory(event.category),
        type: "transit",
        label: "Текущий транзит",
        value: `${subject} · пик ${event.date}`,
        sourcePath: `timing.events.${event.id}`,
        confidence: event.orb <= 0.25 ? "high" : "medium",
        uncertainty: `Пиковый момент рассчитан с орбом ${event.orb.toFixed(3)}°.`,
        deepLink: `/cabinet/astrology?tab=timing#${evidenceAnchorId("timing", event.id)}`,
      });
    }
    evidence.push({
      id: stableId("timing", "solar_return", String(timing.solarReturn.year)),
      tradition: "timing",
      category: "timing",
      type: "solar_return",
      label: "Солнечное возвращение",
      value: timing.solarReturn.exactAtLocal,
      sourcePath: "timing.solarReturn.exactAtLocal",
      confidence: "high",
      uncertainty: "Место рождения принято как место возвращения; дома не рассчитываются.",
      deepLink: "/cabinet/astrology?tab=timing#solar-return",
    });
    for (const aspect of timing.progressions.aspectsToNatal.slice(0, 12)) {
      const key = `${aspect.progressedKey}-${aspect.aspect}-${aspect.natalKey}`;
      evidence.push({
        id: stableId("timing", "progression", key),
        tradition: "timing",
        category: PLANET_CATEGORY[aspect.natalKey] ?? "timing",
        type: "progression",
        label: "Вторичная прогрессия",
        value: `${russianPlanetLabel(aspect.progressedKey)} · ${ASPECT_NAMES[aspect.aspect ?? ""] ?? "аспект не указан"} · ${russianPlanetLabel(aspect.natalKey)} · ${aspect.orb.toFixed(3)}°`,
        sourcePath: `timing.progressions.aspectsToNatal.${key}`,
        confidence: "medium",
        uncertainty: "Символическая методика «день за год»; дома и углы исключены.",
        deepLink: "/cabinet/astrology?tab=timing#secondary-progressions",
      });
    }
  } else if (chart.transits?.length) {
    chart.transits.slice(0, 12).forEach((transit, index) => evidence.push({
      id: stableId("timing", "transit", `${transit.kind}-${transit.date ?? "current"}-${transit.planet}-${stableHash(transit.note)}`),
      tradition: "timing",
      category: "timing",
      type: "transit",
      label: "Текущий транзит",
      value: transit.note,
      sourcePath: `transits.${index}`,
      confidence: "medium",
      uncertainty: "Краткий транзитный контекст.",
      deepLink: "/cabinet/astrology?tab=timing",
    }));
  }

  return [...new Map(evidence.map((item) => [item.id, item])).values()]
    .sort((a, b) => a.id.localeCompare(b.id));
}

const TOPIC_CATEGORIES: Array<[RegExp, NatalEvidenceCategory[]]> = [
  [/(люб|отнош|партн|брак|семь)/i, ["relationships", "emotions"]],
  [/(работ|карьер|дел|профес|призван)/i, ["career", "identity"]],
  [/(деньг|финанс|ресурс|доход)/i, ["resources", "career"]],
  [/(сейчас|период|месяц|год|когда|прогноз)/i, ["timing"]],
  [/(стресс|конфликт|трудн|напряж)/i, ["tensions", "emotions"]],
];

export function scopeNatalEvidence(evidence: NatalEvidence[], topic: string, limit = 12): NatalEvidence[] {
  const categories = TOPIC_CATEGORIES.find(([pattern]) => pattern.test(topic))?.[1];
  const preferred = categories ? evidence.filter((item) => categories.includes(item.category)) : evidence;
  const baseline = preferred.length ? preferred : evidence;
  return baseline.slice(0, Math.max(1, Math.min(limit, 20)));
}

export function formatEvidencePrompt(evidence: NatalEvidence[]): string {
  if (!evidence.length) return "";
  return evidence.map((item) =>
    `[${item.id}] ${item.label}: ${item.value}; уверенность=${item.confidence}${item.uncertainty ? `; ограничение=${item.uncertainty}` : ""}`
  ).join("\n");
}
