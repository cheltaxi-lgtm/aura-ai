import { parseBirthDate, sumDigits } from "./constants";
import { MAJOR_ARCANA } from "../tarot";

export const MATRIX_CALCULATION_VERSION = "matrix-v1" as const;

export interface DestinyMatrixPoint {
  number: number;
  arcanaName: string;
  arcanaMeaning: string;
}

/**
 * matrix-v1 positions. Legacy keys (body…karma) stay stable for session/UI compat;
 * talents / paternal / maternal / yearArcana are additive.
 */
export interface DestinyMatrixResult {
  body: DestinyMatrixPoint;
  energy: DestinyMatrixPoint;
  roots: DestinyMatrixPoint;
  purpose: DestinyMatrixPoint;
  relationships: DestinyMatrixPoint;
  money: DestinyMatrixPoint;
  karma: DestinyMatrixPoint;
  talents: DestinyMatrixPoint;
  paternal: DestinyMatrixPoint;
  maternal: DestinyMatrixPoint;
  yearArcana: DestinyMatrixPoint;
}

export const DESTINY_MATRIX_POINT_KEYS = [
  "body",
  "energy",
  "roots",
  "purpose",
  "relationships",
  "money",
  "karma",
  "talents",
  "paternal",
  "maternal",
  "yearArcana",
] as const satisfies readonly (keyof DestinyMatrixResult)[];

export type DestinyMatrixOptions = {
  /** Freeze year for yearArcana (tests / deterministic preview). Defaults to current calendar year. */
  asOfYear?: number;
};

/**
 * Reduces any sum to the 1–22 range used by the 22-arcana "Матрица судьбы" method
 * (taro-numerology popularised by Natalia Ladini's school). 0 wraps to 22 (Шут/The Fool).
 */
export function reduceToArcanaNumber(n: number): number {
  let value = Math.abs(Math.trunc(n));
  while (value > 22) {
    value = sumDigits(value);
  }
  return value === 0 ? 22 : value;
}

/** Arcana numbers run 1–22; id 0 (Шут) represents 22 in this method, ids 1–21 map 1:1. */
export function arcanaForNumber(n: number): DestinyMatrixPoint {
  const card = n === 22 ? MAJOR_ARCANA[0] : MAJOR_ARCANA[n];
  return {
    number: n,
    arcanaName: card?.name ?? `Аркан ${n}`,
    arcanaMeaning: card?.meaning ?? "",
  };
}

/**
 * Own adaptation of the popular "Матрица судьбы" (22-arcana taro-numerology) method.
 * Version matrix-v1: base A/B/C + purpose/lines + talents + paternal/maternal + year arcana.
 * Zovus interpretation for entertainment/self-reflection — not a licensed Ladini calculator.
 */
export function destinyMatrix(
  birthDate: string,
  options?: DestinyMatrixOptions
): DestinyMatrixResult | null {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;

  const a = reduceToArcanaNumber(parsed.day);
  const b = reduceToArcanaNumber(parsed.month);
  const c = reduceToArcanaNumber(sumDigits(parsed.year));
  const d = reduceToArcanaNumber(a + b + c);
  const e = reduceToArcanaNumber(a + d);
  const f = reduceToArcanaNumber(b + d);
  const g = reduceToArcanaNumber(c + d);
  const talents = reduceToArcanaNumber(a + b);
  const paternal = reduceToArcanaNumber(a + c);
  const maternal = reduceToArcanaNumber(b + c);
  const year =
    typeof options?.asOfYear === "number" && Number.isFinite(options.asOfYear)
      ? Math.trunc(options.asOfYear)
      : new Date().getFullYear();
  const yearArcana = reduceToArcanaNumber(a + b + sumDigits(year));

  return {
    body: arcanaForNumber(a),
    energy: arcanaForNumber(b),
    roots: arcanaForNumber(c),
    purpose: arcanaForNumber(d),
    relationships: arcanaForNumber(e),
    money: arcanaForNumber(f),
    karma: arcanaForNumber(g),
    talents: arcanaForNumber(talents),
    paternal: arcanaForNumber(paternal),
    maternal: arcanaForNumber(maternal),
    yearArcana: arcanaForNumber(yearArcana),
  };
}

export function formatDestinyMatrixAscii(m: DestinyMatrixResult): string {
  return [
    `Матрица судьбы (${MATRIX_CALCULATION_VERSION}, 22 аркана):`,
    `Тело/характер: ${m.body.number} — ${m.body.arcanaName}`,
    `Энергия: ${m.energy.number} — ${m.energy.arcanaName}`,
    `Род/корни: ${m.roots.number} — ${m.roots.arcanaName}`,
    `Предназначение: ${m.purpose.number} — ${m.purpose.arcanaName}`,
    `Таланты: ${m.talents.number} — ${m.talents.arcanaName}`,
    `Отношения: ${m.relationships.number} — ${m.relationships.arcanaName}`,
    `Деньги: ${m.money.number} — ${m.money.arcanaName}`,
    `Род отца: ${m.paternal.number} — ${m.paternal.arcanaName}`,
    `Род матери: ${m.maternal.number} — ${m.maternal.arcanaName}`,
    `Карма: ${m.karma.number} — ${m.karma.arcanaName}`,
    `Аркан года: ${m.yearArcana.number} — ${m.yearArcana.arcanaName}`,
  ].join("\n");
}
