import {
  destinyNumber,
  lifePathNumber,
  soulNumber,
  type NumerologyResult,
} from "./calculator";
import type { NumerologySystem } from "./constants";

export interface CompatibilityResult {
  score: number;
  lifePathMatch: string;
  destinyMatch: string;
  strengths: string[];
  risks: string[];
  summary: string;
}

const COMPLEMENTARY: Record<number, number[]> = {
  1: [1, 3, 5, 7],
  2: [2, 4, 6, 8],
  3: [1, 3, 5, 9],
  4: [2, 4, 6, 8],
  5: [1, 3, 5, 7],
  6: [2, 4, 6, 9],
  7: [1, 5, 7, 9],
  8: [2, 4, 6, 8],
  9: [3, 6, 7, 9],
  11: [2, 6, 11, 22],
  22: [4, 8, 11, 22],
  33: [6, 9, 11, 33],
};

function matchScore(a: NumerologyResult, b: NumerologyResult): number {
  if (a.number <= 0 || b.number <= 0) return 50;
  if (a.number === b.number) return 95;
  const compA = COMPLEMENTARY[a.number] ?? [];
  if (compA.includes(b.number)) return 82;
  const diff = Math.abs(a.number - b.number);
  if (diff === 1) return 72;
  if (diff === 2) return 65;
  if (a.isMaster || b.isMaster) return 68;
  return Math.max(35, 60 - diff * 8);
}

function describePair(a: NumerologyResult, b: NumerologyResult, label: string): string {
  if (a.number <= 0 || b.number <= 0) return `${label}: недостаточно данных.`;
  if (a.number === b.number) return `${label}: совпадение (${a.number}) — сильное родство вибраций.`;
  return `${label}: ${a.number} и ${b.number} — ${matchScore(a, b) >= 75 ? "гармоничное" : "учебное"} сочетание.`;
}

/** Совместимость пары по датам рождения и именам. */
export function compatibility(
  dateA: string,
  nameA: string,
  dateB: string,
  nameB: string,
  system: NumerologySystem = "pythagorean"
): CompatibilityResult {
  const lpA = lifePathNumber(dateA);
  const lpB = lifePathNumber(dateB);
  const destA = destinyNumber(nameA, system);
  const destB = destinyNumber(nameB, system);
  const soulA = soulNumber(nameA, system);
  const soulB = soulNumber(nameB, system);

  const lpScore = matchScore(lpA, lpB);
  const destScore = matchScore(destA, destB);
  const soulScore = matchScore(soulA, soulB);

  const score = Math.round(lpScore * 0.45 + destScore * 0.35 + soulScore * 0.2);
  const clamped = Math.min(100, Math.max(0, score));

  const strengths: string[] = [];
  const risks: string[] = [];

  if (lpScore >= 80) strengths.push("Числа пути резонируют — общее направление жизни понятно друг другу.");
  if (destScore >= 80) strengths.push("Числа судьбы поддерживают совместные цели и проекты.");
  if (soulScore >= 80) strengths.push("Душевные числа совпадают — глубокое эмоциональное понимание.");

  if (lpScore < 60) risks.push("Разные жизненные ритмы — нужны договорённости о темпе и приоритетах.");
  if (destScore < 60) risks.push("Разные амбиции — важно проговаривать ожидания от союза.");
  if (soulA.number !== soulB.number && soulScore < 55) {
    risks.push("Разные потребности в близости — учитесь слышать без оценки.");
  }
  if ((lpA.isMaster || lpB.isMaster) && lpScore < 75) {
    risks.push("Мастер-число одного партнёра требует терпения и принятия интенсивности.");
  }

  if (strengths.length === 0) {
    strengths.push("Союз учит через различия — дополняете слепые зоны друг друга.");
  }

  const summary =
    clamped >= 80
      ? "Высокая совместимость: числа поддерживают союз, есть потенциал для долгого партнёрства."
      : clamped >= 60
        ? "Хорошая совместимость: при осознанности пара может построить крепкий союз."
        : clamped >= 45
          ? "Умеренная совместимость: потребуется работа над коммуникацией и границами."
          : "Сложное сочетание: цените различия как урок, не как приговор.";

  return {
    score: clamped,
    lifePathMatch: describePair(lpA, lpB, "Число пути"),
    destinyMatch: describePair(destA, destB, "Число судьбы"),
    strengths,
    risks,
    summary,
  };
}
