/**
 * Compact chart facts for Pro premium drafts.
 * Ephemeral compute only — never writes consumer cabinet reports.
 */

import { resolveBirthPlace } from "@/lib/natal/geocode";
import { computeWesternChart } from "@/lib/natal/western";
import {
  birthTimeLabel,
  parseBirthTimeToDecimal,
  resolveBirthUtcOffsetHours,
} from "@/lib/natal/time";
import { destinyMatrix, type DestinyMatrixResult } from "@/lib/numerology/destiny-matrix";
import { calculateHdChart } from "@/lib/human-design/calculate";
import { formatHdEvidence } from "@/lib/human-design/prompt";

export type ProBirthPayload = {
  birthDate?: string | null;
  birthTime?: string | null;
  birthPlace?: string | null;
  birthCity?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  birthLat?: number | null;
  birthLon?: number | null;
  birthTz?: string | null;
  timeKnown?: boolean;
};

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function normalizeBirthFields(
  payload: Record<string, unknown>
): ProBirthPayload {
  return {
    birthDate: str(payload.birthDate),
    birthTime: str(payload.birthTime),
    birthPlace: str(payload.birthPlace) || str(payload.birthCity),
    birthCity: str(payload.birthCity) || str(payload.birthPlace),
    latitude: num(payload.latitude) ?? num(payload.birthLat),
    longitude: num(payload.longitude) ?? num(payload.birthLon),
    timezone: str(payload.timezone) || str(payload.birthTz),
    birthLat: num(payload.birthLat) ?? num(payload.latitude),
    birthLon: num(payload.birthLon) ?? num(payload.longitude),
    birthTz: str(payload.birthTz) || str(payload.timezone),
    timeKnown:
      typeof payload.timeKnown === "boolean"
        ? payload.timeKnown
        : Boolean(str(payload.birthTime)),
  };
}

export async function enrichBirthPlace(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const n = normalizeBirthFields(payload);
  const out: Record<string, unknown> = {
    ...payload,
    birthDate: n.birthDate,
    birthTime: n.birthTime,
    birthPlace: n.birthPlace,
    birthCity: n.birthCity,
    timeKnown: n.timeKnown,
  };

  const city = n.birthPlace || n.birthCity;

  // Prefer geocode timezone for the labeled city — guards silent
  // Europe/Moscow stuck on a Berlin/Potsdam (etc.) place card.
  if (city) {
    const resolved = await resolveBirthPlace(city);
    if (resolved) {
      out.birthPlace = resolved.label;
      out.birthCity = resolved.label;
      out.latitude = resolved.latitude;
      out.longitude = resolved.longitude;
      out.timezone = resolved.timezone;
      out.birthLat = resolved.latitude;
      out.birthLon = resolved.longitude;
      out.birthTz = resolved.timezone;
      if (n.timezone && n.timezone !== resolved.timezone) {
        out.geocodeWarning = "timezone_relabeled";
      }
      return out;
    }
    out.geocodeWarning = "place_unresolved";
  }

  if (n.latitude != null && n.longitude != null && n.timezone) {
    out.latitude = n.latitude;
    out.longitude = n.longitude;
    out.timezone = n.timezone;
    out.birthLat = n.latitude;
    out.birthLon = n.longitude;
    out.birthTz = n.timezone;
    return out;
  }

  return out;
}

function bodyLine(label: string, body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { sign?: { name?: string }; degree?: number; retrograde?: boolean };
  const sign = b.sign?.name;
  if (!sign) return null;
  const deg = typeof b.degree === "number" ? ` ${b.degree.toFixed(1)}°` : "";
  const ret = b.retrograde ? " R" : "";
  return `${label}: ${sign}${deg}${ret}`;
}

export async function computeNatalFacts(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const enriched = await enrichBirthPlace(payload);
  const n = normalizeBirthFields(enriched);
  const warnings: string[] = [];

  if (!n.birthDate) {
    return { ok: false, error: "birth_date_required", warnings: ["Нет даты рождения"] };
  }

  const lat = num(enriched.latitude) ?? num(enriched.birthLat);
  const lon = num(enriched.longitude) ?? num(enriched.birthLon);
  const tz = str(enriched.timezone) || str(enriched.birthTz);

  if (lat == null || lon == null || !tz) {
    return {
      ok: false,
      error: "place_required",
      birthDate: n.birthDate,
      warnings: ["Нужен город рождения с координатами для полной натальной карты"],
    };
  }

  const decimalHour = n.timeKnown ? parseBirthTimeToDecimal(n.birthTime) : null;
  if (n.timeKnown && decimalHour == null) {
    warnings.push("Некорректное время — используем полдень");
  }
  const effectiveHour = decimalHour ?? 12;
  const timeKnown = Boolean(n.timeKnown && decimalHour != null);
  if (!timeKnown) {
    warnings.push("Время неизвестно — асцендент и дома приблизительны (полдень)");
  }

  const timeStr = birthTimeLabel(effectiveHour);
  const utcOffset = resolveBirthUtcOffsetHours(n.birthDate, timeStr, tz);
  const western = await computeWesternChart({
    birthDate: n.birthDate,
    localHourDecimal: effectiveHour,
    utcOffsetHours: utcOffset,
    latitude: lat,
    longitude: lon,
    timeKnown,
  });

  const planetLines: string[] = [];
  for (const key of [
    "sun",
    "moon",
    "rising",
    "midheaven",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
  ] as const) {
    const src =
      key === "sun" || key === "moon" || key === "rising" || key === "midheaven"
        ? western[key]
        : (western.planets as Record<string, unknown> | undefined)?.[key];
    const line = bodyLine(key, src);
    if (line) {
      const house =
        key !== "rising" && key !== "midheaven"
          ? (western.planetHouses as Record<string, number> | undefined)?.[
              key === "sun" || key === "moon" ? key : key
            ]
          : undefined;
      planetLines.push(house ? `${line} · дом ${house}` : line);
    }
  }

  const aspects = Array.isArray(western.aspects)
    ? (western.aspects as {
        planet1?: string;
        planet2?: string;
        aspect?: string;
        orb?: number;
      }[])
        .slice(0, 18)
        .map(
          (a) =>
            `${a.planet1}–${a.planet2} ${a.aspect} (орб ${typeof a.orb === "number" ? a.orb.toFixed(1) : a.orb})`
        )
    : [];

  const evidenceText = [
    `Дата: ${n.birthDate}`,
    `Время: ${timeKnown ? timeStr : "неизвестно (12:00)"}`,
    `Место: ${n.birthPlace || "—"} (${tz})`,
    `Big Three: ${String(western.bigThree || "")}`,
    "",
    "Планеты и углы:",
    ...planetLines.map((l) => `- ${l}`),
    "",
    "Аспекты (топ):",
    ...aspects.map((l) => `- ${l}`),
    warnings.length ? `\nПредупреждения: ${warnings.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ok: true,
    birthDate: n.birthDate,
    birthTime: timeKnown ? timeStr : null,
    timeKnown,
    place: n.birthPlace,
    timezone: tz,
    latitude: lat,
    longitude: lon,
    bigThree: western.bigThree,
    planetLines,
    aspects,
    warnings,
    evidenceText,
  };
}

function pointLabel(p: { number: number; arcanaName: string }): string {
  return `${p.number} «${p.arcanaName}»`;
}

export function computeMatrixFacts(
  birthDate: string,
  existing?: DestinyMatrixResult | Record<string, unknown> | null
): Record<string, unknown> {
  const matrix: DestinyMatrixResult | null =
    existing && typeof existing === "object" && "body" in existing
      ? (existing as DestinyMatrixResult)
      : destinyMatrix(birthDate);

  if (!matrix) {
    return {
      ok: false,
      error: "invalid_birth_date",
      warnings: ["Некорректная дата рождения для матрицы"],
    };
  }

  const zones: Array<[string, DestinyMatrixResult[keyof DestinyMatrixResult]]> = [
    ["Тело", matrix.body],
    ["Энергия", matrix.energy],
    ["Корни", matrix.roots],
    ["Комфорт / сила", matrix.comfort],
    ["Отношения", matrix.relationships],
    ["Деньги", matrix.money],
    ["Карма (земля)", matrix.karma],
    ["Таланты", matrix.talents],
    ["Отцовская линия", matrix.paternal],
    ["Материнская линия", matrix.maternal],
    ["Небо / дух", matrix.skySpirit],
    ["Земная задача", matrix.earthTask],
  ];

  const zoneLines = zones
    .filter(([, v]) => v && typeof v === "object" && "number" in (v as object))
    .map(([label, v]) => `${label}: ${pointLabel(v as { number: number; arcanaName: string })}`);

  const channelLines = (matrix.channels || []).map((ch) => {
    const pts = ch.points.map((p) => pointLabel(p)).join(" → ");
    return `${ch.label}: ${pts}`;
  });

  const karmic = matrix.karmicTail
    .map((p) => pointLabel(p))
    .join(" → ");

  const evidenceText = [
    `Дата рождения: ${birthDate}`,
    `Фокус: ${matrix.focusLabel} (${matrix.focusKey})`,
    "",
    "Зоны:",
    ...zoneLines.map((l) => `- ${l}`),
    "",
    `Кармический хвост: ${karmic}`,
    "",
    "Каналы:",
    ...channelLines.map((l) => `- ${l}`),
    "",
    `Возрастной пояс сейчас: ${matrix.ageCurrent.age} лет → ${pointLabel(matrix.ageCurrent)}`,
  ].join("\n");

  return {
    ok: true,
    birthDate,
    focusKey: matrix.focusKey,
    focusLabel: matrix.focusLabel,
    zoneLines,
    channelLines,
    karmicTail: karmic,
    ageCurrent: matrix.ageCurrent,
    evidenceText,
    matrix,
  };
}

export function computeHdFacts(payload: Record<string, unknown>): Record<string, unknown> {
  const n = normalizeBirthFields(payload);
  if (!n.birthDate) {
    return { ok: false, error: "birth_date_required", warnings: ["Нет даты рождения"] };
  }
  const tz = n.timezone || n.birthTz;
  if (!tz) {
    return {
      ok: false,
      error: "timezone_required",
      birthDate: n.birthDate,
      warnings: ["Нужен город рождения с часовым поясом (не угадываем Москву)"],
    };
  }
  try {
    const chart = calculateHdChart({
      birthDate: n.birthDate,
      birthTime: n.timeKnown ? n.birthTime ?? null : null,
      timezone: tz,
    });
    const placeLabel = n.birthPlace || n.birthCity || null;
    const evidenceText = formatHdEvidence(chart, { placeLabel });
    return {
      ok: true,
      birthDate: n.birthDate,
      birthTime: chart.birth?.time ?? null,
      timeKnown: chart.timeKnown,
      timezone: tz,
      birthPlace: placeLabel,
      type: chart.type,
      authority: chart.authority,
      profile: chart.profile,
      definition: chart.definition,
      definedCenters: chart.definedCenters,
      activeGates: chart.activeGates,
      stability: chart.stability ?? null,
      evidenceText,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "hd_calc_failed",
      warnings: ["Не удалось рассчитать карту Human Design"],
    };
  }
}
