import { calculateVedic } from "natalengine";
import { computeDeepTransits } from "./transits";
import { resolveBirthPlace } from "./geocode";
import {
  birthTimeLabel,
  parseBirthTimeToDecimal,
  resolveBirthUtcOffsetHours,
  localDateStringInTimezone,
} from "./time";
import type { NatalChartInput, NatalChartRecord, NatalPlace } from "./types";
import { NATAL_ENGINE_VERSION, buildBirthFingerprint } from "./types";
import { computeWesternChart } from "./western";
import { canonicalVedicEnginePayload } from "./vedic-precision";
import { normalizeVedicChart } from "./vedic";

function normalizeBirthDate(raw: string): string {
  const d = raw.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error("INVALID_BIRTH_DATE");
  }
  // Regex alone lets impossible civil dates (2001-02-29, 2026-13-40) reach the
  // engines, where they silently roll over to a different day and shift every
  // position. Reject them instead of computing a silently wrong chart.
  const [year, month, day] = d.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day ||
    probe.getTime() > Date.now()
  ) {
    throw new Error("INVALID_BIRTH_DATE");
  }
  return d;
}

export async function computeNatalChartRecord(
  userId: string,
  input: NatalChartInput
): Promise<NatalChartRecord> {
  const birthDate = normalizeBirthDate(input.birthDate);
  const warnings: string[] = [];
  const timeKnown = input.timeKnown && Boolean(input.birthTime?.trim());
  const profileFingerprint = buildBirthFingerprint({
    birthDate,
    birthTime: input.birthTime,
    birthCity: input.birthCity,
    birthTimeOccurrence: input.birthTimeOccurrence,
  });

  let place: NatalPlace | null = null;
  if (
    input.place &&
    typeof input.place.latitude === "number" && Number.isFinite(input.place.latitude) && Math.abs(input.place.latitude) <= 90 &&
    typeof input.place.longitude === "number" && Number.isFinite(input.place.longitude) && Math.abs(input.place.longitude) <= 180 &&
    typeof input.place.timezone === "string" &&
    input.place.timezone.trim() &&
    typeof input.place.label === "string" &&
    input.place.label.trim()
  ) {
    place = {
      // Label reaches LLM prompts — collapse whitespace/newlines and cap length
      // so a crafted place string can't inject instructions.
      label: input.place.label.trim().replace(/\s+/g, " ").slice(0, 120),
      latitude: input.place.latitude,
      longitude: input.place.longitude,
      timezone: input.place.timezone.trim(),
    };
  } else if (input.place) {
    throw new Error("INVALID_BIRTH_PLACE");
  } else if (input.birthCity?.trim()) {
    const resolved = await resolveBirthPlace(input.birthCity.trim());
    if (resolved) {
      place = {
        label: resolved.label,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        timezone: resolved.timezone,
      };
    } else {
      warnings.push("Не удалось определить координаты города рождения.");
    }
  } else {
    warnings.push("Город рождения не указан — асцендент и дома недоступны.");
  }

  const decimalHour = timeKnown ? parseBirthTimeToDecimal(input.birthTime) : null;
  if (timeKnown && decimalHour == null) {
    throw new Error("INVALID_BIRTH_TIME");
  }

  const effectiveHour = decimalHour ?? 12;
  const effectiveTimeKnown = timeKnown && decimalHour != null;

  let western: Record<string, unknown> | null = null;
  let vedic: NatalChartRecord["vedic"] = null;

  if (place) {
    const timeStr = birthTimeLabel(effectiveHour);
    const utcOffset = resolveBirthUtcOffsetHours(birthDate, timeStr, place.timezone, input.birthTimeOccurrence);
    // Planet positions use one canonical, independently verified ephemeris.
    // Legacy configuration names no longer select a less accurate planet engine.
    western = await computeWesternChart({ birthDate, localHourDecimal: effectiveHour,
      utcOffsetHours: utcOffset, latitude: place.latitude, longitude: place.longitude, timeKnown: effectiveTimeKnown });
    const houseWarnings = Array.isArray(western.houseWarnings) ? western.houseWarnings.filter((item): item is string => typeof item === "string") : [];
    warnings.push(...houseWarnings);

    const calculatedVedic = calculateVedic(
      birthDate,
      effectiveHour,
      utcOffset,
      place.latitude,
      place.longitude
    );
    vedic = normalizeVedicChart(canonicalVedicEnginePayload(calculatedVedic), {
      timeKnown: effectiveTimeKnown,
      hasLocation: true,
    });
    if (!vedic) {
      warnings.push("Движок вернул неполный ведический расчёт.");
    }

    if (!effectiveTimeKnown) {
      warnings.push(
        "Точное время неизвестно — асцендент, MC и дома не считаются достоверными."
      );
    }
  } else {
    warnings.push("Полная карта недоступна без места рождения.");
  }

  const base: NatalChartRecord = {
    userId,
    timeKnown: effectiveTimeKnown,
    place,
    western,
    vedic,
    birthFingerprint: buildBirthFingerprint({ birthDate, birthTime: input.birthTime, birthCity: input.birthCity, birthTimeOccurrence: input.birthTimeOccurrence, place, timeKnown: effectiveTimeKnown }),
    profileFingerprint,
    birthTimeOccurrence: input.birthTimeOccurrence,
    computedAt: new Date().toISOString(),
    engineVersion: NATAL_ENGINE_VERSION,
    warnings,
  };

  if (western && place) {
    const transitCacheDate = localDateStringInTimezone(place.timezone);
    const transits = await computeDeepTransits(base, { correlateMemory: false });
    return { ...base, transits, transitCacheDate };
  }

  return base;
}
