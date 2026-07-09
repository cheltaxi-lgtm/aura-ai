import type { RitualType } from "@/lib/ritual-config";

function getJulianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

export function getMoonPhase(date: Date = new Date()): {
  phase: string;
  phaseKey: "new" | "waxing" | "full" | "waning";
  sign: string;
  favorable: RitualType[];
  description: string;
} {
  const jd = getJulianDate(date);
  const phase = ((jd - 2451549.5) / 29.53058867) % 1;

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
  const signIndex = Math.floor(((jd - 2451549.5) / 2.36) % 12);
  const sign = signs[Math.abs(signIndex) % 12];

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
