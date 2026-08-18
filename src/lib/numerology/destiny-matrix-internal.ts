import { parseBirthDate } from "./constants";
import { MATRIX_LABELS } from "./matrix-labels";
import type { DestinyMatrixAgePoint, DestinyMatrixOptions, DestinyMatrixPoint } from "./matrix-result";

export const AGE_BELT_END = 80;

export function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function yearsBetween(
  birth: { year: number; month: number; day: number },
  asOf: Date
): number {
  let age = asOf.getFullYear() - birth.year;
  const m = asOf.getMonth() + 1;
  const d = asOf.getDate();
  if (m < birth.month || (m === birth.month && d < birth.day)) age -= 1;
  return Math.max(0, age);
}

export function resolveAsOf(options?: DestinyMatrixOptions): {
  year: number;
  month: number;
  date: Date;
} {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let date = now;
  if (typeof options?.asOfYear === "number" && Number.isFinite(options.asOfYear)) {
    year = Math.trunc(options.asOfYear);
  }
  if (typeof options?.asOfMonth === "number" && Number.isFinite(options.asOfMonth)) {
    month = Math.min(12, Math.max(1, Math.trunc(options.asOfMonth)));
  }
  if (options?.asOfDate) {
    const parsed = parseBirthDate(options.asOfDate);
    if (parsed) {
      date = new Date(parsed.year, parsed.month - 1, parsed.day);
      year = parsed.year;
      month = parsed.month;
    }
  } else if (options?.asOfYear != null || options?.asOfMonth != null) {
    date = new Date(year, month - 1, Math.min(28, now.getDate()));
  }
  return { year, month, date };
}

export function agePoint(
  age: number,
  point: DestinyMatrixPoint
): DestinyMatrixAgePoint {
  return {
    age,
    number: point.number,
    arcanaName: point.arcanaName,
    arcanaMeaning: point.arcanaMeaning,
  };
}

const FOCUS_LABELS: Record<string, string> = {
  karma: "Кармический хвост",
  karmicMid: "Кармический хвост (середина)",
  karmicTip: "Кармический хвост (остриё)",
  money: "Денежный канал",
  relationships: "Канал отношений",
  ageCurrent: "Период возраста",
  purpose: "Зона комфорта",
  yearArcana: "Аркан года",
  monthArcana: "Аркан месяца",
};

/** Zovus-derived accent. Not a Destiny Matrix point. */
export function pickFocus(input: {
  yearN: number;
  monthN: number;
  comfortN: number;
  moneyN: number;
  loveN: number;
  tail: [number, number, number];
  ageN: number;
}): { focusKey: string; focusLabel: string } {
  const candidates: Array<{ key: string; n: number; weight: number }> = [
    { key: "ageCurrent", n: input.ageN, weight: 3 },
    { key: "karma", n: input.tail[0], weight: 2.6 },
    { key: "karmicMid", n: input.tail[1], weight: 2.5 },
    { key: "karmicTip", n: input.tail[2], weight: 2.4 },
    { key: "money", n: input.moneyN, weight: 2 },
    { key: "relationships", n: input.loveN, weight: 2 },
    { key: "purpose", n: input.comfortN, weight: 1 },
    { key: "yearArcana", n: input.yearN, weight: 1.5 },
    { key: "monthArcana", n: input.monthN, weight: 1.5 },
  ];
  let best = candidates[0]!;
  let bestScore = -1;
  for (const c of candidates) {
    let score = c.weight;
    if (c.key !== "yearArcana" && c.n === input.yearN) score += 3;
    if (c.key !== "monthArcana" && c.n === input.monthN) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return {
    focusKey: best.key,
    focusLabel: `${MATRIX_LABELS.focusZovus}: ${FOCUS_LABELS[best.key] ?? best.key}`,
  };
}

export function buildAgeBelt(
  perimeter: number[],
  reduce: (n: number) => number,
  pointFor: (n: number) => DestinyMatrixPoint
): DestinyMatrixAgePoint[] {
  const agePoints: DestinyMatrixAgePoint[] = [];
  for (let i = 0; i < 8; i++) {
    agePoints.push(agePoint(i * 10, pointFor(perimeter[i]!)));
    const mid = reduce(perimeter[i]! + perimeter[(i + 1) % 8]!);
    agePoints.push(agePoint(i * 10 + 5, pointFor(mid)));
  }
  agePoints.push(agePoint(AGE_BELT_END, pointFor(perimeter[0]!)));
  agePoints.sort((p, q) => p.age - q.age);
  return agePoints;
}

export function pickAgeWindow(
  agePoints: DestinyMatrixAgePoint[],
  chronologicalAge: number
): { ageCurrent: DestinyMatrixAgePoint; ageNext: DestinyMatrixAgePoint | null } {
  let ageCurrent = agePoints[0]!;
  let ageNext: DestinyMatrixAgePoint | null = agePoints[1] ?? null;
  for (let i = 0; i < agePoints.length; i++) {
    const pt = agePoints[i]!;
    if (pt.age <= chronologicalAge) {
      ageCurrent = pt;
      ageNext = agePoints[i + 1] ?? null;
    } else break;
  }
  return { ageCurrent, ageNext };
}
