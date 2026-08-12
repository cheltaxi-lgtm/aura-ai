import { calculateAstrology, calculateVedic } from "natalengine";
import { getSetting } from "@/lib/settings";
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
import { normalizeVedicChart } from "./vedic";

function normalizeBirthDate(raw: string): string {
  const d = raw.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
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
  const birthFingerprint = buildBirthFingerprint({
    birthDate,
    birthTime: input.birthTime,
    birthCity: input.birthCity,
  });

  let place: NatalPlace | null = null;
  if (
    input.place &&
    typeof input.place.latitude === "number" &&
    typeof input.place.longitude === "number" &&
    typeof input.place.timezone === "string" &&
    input.place.timezone.trim() &&
    typeof input.place.label === "string" &&
    input.place.label.trim()
  ) {
    place = {
      label: input.place.label.trim(),
      latitude: input.place.latitude,
      longitude: input.place.longitude,
      timezone: input.place.timezone.trim(),
    };
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
    warnings.push("Некорректное время рождения — используем полдень для Луны.");
  }

  const effectiveHour = decimalHour ?? 12;
  const effectiveTimeKnown = timeKnown && decimalHour != null;

  let western: Record<string, unknown> | null = null;
  let vedic: NatalChartRecord["vedic"] = null;

  if (place) {
    const timeStr = birthTimeLabel(effectiveHour);
    const utcOffset = resolveBirthUtcOffsetHours(birthDate, timeStr, place.timezone);
    const natalSettings = await getSetting("natalChart");
    const ephemeris = natalSettings.ephemeris ?? "celestine";

    if (ephemeris === "natalengine") {
      const calculated = calculateAstrology(
        birthDate,
        effectiveHour,
        utcOffset,
        place.latitude,
        place.longitude
      ) as Record<string, unknown>;
      western = { ...calculated, ephemeris: "natalengine" };
    } else {
      western = await computeWesternChart({
        birthDate,
        localHourDecimal: effectiveHour,
        utcOffsetHours: utcOffset,
        latitude: place.latitude,
        longitude: place.longitude,
        timeKnown: effectiveTimeKnown,
      });
      const houseWarnings = Array.isArray(western.houseWarnings)
        ? western.houseWarnings.filter((item): item is string => typeof item === "string")
        : [];
      warnings.push(...houseWarnings);
    }

    const calculatedVedic = calculateVedic(
      birthDate,
      effectiveHour,
      utcOffset,
      place.latitude,
      place.longitude
    );
    vedic = normalizeVedicChart(calculatedVedic, {
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
    birthFingerprint,
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
