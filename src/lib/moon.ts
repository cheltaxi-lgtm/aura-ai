import type { RitualType } from "@/lib/ritual-config";

import { Body, Ecliptic, GeoVector, MoonPhase } from "astronomy-engine";

export function getMoonPhase(date: Date = new Date()): {
  phase: string;
  phaseKey: "new" | "waxing" | "full" | "waning";
  sign: string;
  favorable: RitualType[];
  description: string;
} {
  // Apparent geocentric tropical positions, also used by the natal engine.
  const phase = MoonPhase(date) / 360;

  let phaseKey: "new" | "waxing" | "full" | "waning";
  let phaseName: string;

  if (phase < 0.03 || phase > 0.97) {
    phaseKey = "new";
    phaseName = "Новолуние";
  } else if (phase < 0.47) {
    phaseKey = "waxing";
    phaseName = "Растущая луна";
  } else if (phase < 0.53) {
    phaseKey = "full";
    phaseName = "Полнолуние";
  } else {
    phaseKey = "waning";
    phaseName = "Убывающая луна";
  }

  const signs = [
    "Овне",
    "Тельце",
    "Близнецах",
    "Раке",
    "Льве",
    "Деве",
    "Весах",
    "Скорпионе",
    "Стрельце",
    "Козероге",
    "Водолее",
    "Рыбах",
  ];
  const longitude = Ecliptic(GeoVector(Body.Moon, date, true)).elon;
  const sign = signs[Math.floor(((longitude % 360 + 360) % 360) / 30)];

  const favorable: RitualType[] =
    phaseKey === "waxing"
      ? ["love", "money", "luck", "career"]
      : phaseKey === "full"
        ? ["love", "money", "luck", "protection", "career", "health"]
        : phaseKey === "waning"
          ? ["protection", "release", "health"]
          : ["release"];

  return {
    phase: phaseName,
    phaseKey,
    sign,
    favorable,
    description: `Луна в ${sign}`,
  };
}
