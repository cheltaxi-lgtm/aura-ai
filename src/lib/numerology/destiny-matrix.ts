import { parseBirthDate, sumDigits } from "./constants";
import { MAJOR_ARCANA } from "../tarot";

export interface DestinyMatrixPoint {
  number: number;
  arcanaName: string;
  arcanaMeaning: string;
}

export interface DestinyMatrixResult {
  body: DestinyMatrixPoint;
  energy: DestinyMatrixPoint;
  roots: DestinyMatrixPoint;
  purpose: DestinyMatrixPoint;
  relationships: DestinyMatrixPoint;
  money: DestinyMatrixPoint;
  karma: DestinyMatrixPoint;
}

/**
 * Reduces any sum to the 1–22 range used by the 22-arcana "Матрица судьбы" method
 * (taro-numerology popularised by Natalia Ladini's school). 0 wraps to 22 (Шут/The Fool).
 */
function reduceToArcanaNumber(n: number): number {
  let value = Math.abs(Math.trunc(n));
  while (value > 22) {
    value = sumDigits(value);
  }
  return value === 0 ? 22 : value;
}

/** Arcana numbers run 1–22; id 0 (Шут) represents 22 in this method, ids 1–21 map 1:1. */
function arcanaForNumber(n: number): DestinyMatrixPoint {
  const card = n === 22 ? MAJOR_ARCANA[0] : MAJOR_ARCANA[n];
  return {
    number: n,
    arcanaName: card?.name ?? `Аркан ${n}`,
    arcanaMeaning: card?.meaning ?? "",
  };
}

/**
 * Own adaptation of the popular "Матрица судьбы" (22-arcana taro-numerology) method:
 * day/month/year reduce to three base points, their sum gives the central "purpose" arcana,
 * and its pairwise sums with each base point give relationships/money/karma points.
 * This is Zovus's interpretation for entertainment/self-reflection, not a licensed calculator.
 */
export function destinyMatrix(birthDate: string): DestinyMatrixResult | null {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;

  const a = reduceToArcanaNumber(parsed.day);
  const b = reduceToArcanaNumber(parsed.month);
  const c = reduceToArcanaNumber(sumDigits(parsed.year));
  const d = reduceToArcanaNumber(a + b + c);
  const e = reduceToArcanaNumber(a + d);
  const f = reduceToArcanaNumber(b + d);
  const g = reduceToArcanaNumber(c + d);

  return {
    body: arcanaForNumber(a),
    energy: arcanaForNumber(b),
    roots: arcanaForNumber(c),
    purpose: arcanaForNumber(d),
    relationships: arcanaForNumber(e),
    money: arcanaForNumber(f),
    karma: arcanaForNumber(g),
  };
}

export function formatDestinyMatrixAscii(m: DestinyMatrixResult): string {
  return [
    "Матрица судьбы (22 аркана):",
    `Тело/характер: ${m.body.number} — ${m.body.arcanaName}`,
    `Энергия: ${m.energy.number} — ${m.energy.arcanaName}`,
    `Род/корни: ${m.roots.number} — ${m.roots.arcanaName}`,
    `Предназначение: ${m.purpose.number} — ${m.purpose.arcanaName}`,
    `Отношения: ${m.relationships.number} — ${m.relationships.arcanaName}`,
    `Деньги: ${m.money.number} — ${m.money.arcanaName}`,
    `Карма: ${m.karma.number} — ${m.karma.arcanaName}`,
  ].join("\n");
}
