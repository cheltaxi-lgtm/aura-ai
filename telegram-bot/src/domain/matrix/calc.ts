import { FULL_DECK } from "../deck/cards.js";
import type { MatrixDiagramInput, MatrixDiagramSlot } from "../../render/matrix-diagram.js";

/**
 * Must stay equal to site `MATRIX_CALCULATION_VERSION`.
 * Drift is caught by `scripts/verify-matrix-calc-drift.mjs`.
 */
export const BOT_MATRIX_CALC_VERSION = "matrix-v2" as const;

/** Same reduce as site matrix-v2 (1–22; 0 → 22). */
function sumDigits(n: number): number {
  return String(Math.abs(Math.trunc(n)))
    .split("")
    .reduce((a, d) => a + Number(d), 0);
}

function reduceToArcanaNumber(n: number): number {
  let value = Math.abs(Math.trunc(n));
  while (value > 22) value = sumDigits(value);
  return value === 0 ? 22 : value;
}

function parseBirthDate(raw: string): { day: number; month: number; year: number } | null {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }
  const dmy = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  if (dmy) {
    return { day: Number(dmy[1]), month: Number(dmy[2]), year: Number(dmy[3]) };
  }
  return null;
}

function arcanaName(n: number): string {
  const card = n === 22 ? FULL_DECK.find((c) => c.id === 0) : FULL_DECK.find((c) => c.id === n);
  return card?.name ?? `Аркан ${n}`;
}

function yearsBetween(
  birth: { day: number; month: number; year: number },
  asOf: Date
): number {
  let age = asOf.getFullYear() - birth.year;
  const beforeBirthday =
    asOf.getMonth() + 1 < birth.month ||
    (asOf.getMonth() + 1 === birth.month && asOf.getDate() < birth.day);
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

type SlotDef = {
  key: string;
  label: string;
  area: string;
  featured?: boolean;
  pick: (p: Record<string, number>) => number;
};

/** Mapping matches site DESTINY_MATRIX_DIAGRAM_SLOTS (matrix-v2). */
const SLOTS: SlotDef[] = [
  { key: "energy", label: "Небо / энергия", area: "energy", pick: (p) => p.b! },
  { key: "skySpirit", label: "Дух", area: "sky", pick: (p) => p.sky! },
  { key: "body", label: "Характер", area: "body", pick: (p) => p.a! },
  {
    key: "purpose",
    label: "Зона комфорта",
    area: "purpose",
    featured: true,
    pick: (p) => p.x!,
  },
  { key: "roots", label: "Материя / год", area: "roots", pick: (p) => p.c! },
  { key: "talents", label: "Таланты", area: "talents", pick: (p) => p.ab! },
  { key: "relationships", label: "Отношения", area: "rel", pick: (p) => p.love! },
  { key: "money", label: "Деньги", area: "money", pick: (p) => p.money! },
  { key: "paternal", label: "Род отца", area: "paternal", pick: (p) => p.paternal! },
  { key: "maternal", label: "Род матери", area: "maternal", pick: (p) => p.maternal! },
  { key: "karma", label: "Хвост · корень", area: "karma", pick: (p) => p.g! },
  { key: "karmicMid", label: "Хвост · середина", area: "tailMid", pick: (p) => p.mid! },
  { key: "karmicTip", label: "Хвост · остриё", area: "tailTip", pick: (p) => p.tip! },
  { key: "ageCurrent", label: "Возраст сейчас", area: "age", pick: (p) => p.age! },
  { key: "yearArcana", label: "Аркан года", area: "year", pick: (p) => p.yearArcana! },
  { key: "monthArcana", label: "Аркан месяца", area: "month", pick: (p) => p.monthArcana! },
];

/**
 * Local fallback matching site destinyMatrix matrix-v2 when API omits `diagram`.
 */
export function buildLocalMatrixDiagram(
  birthDate: string,
  name?: string | null
): MatrixDiagramInput | null {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;

  const a = reduceToArcanaNumber(parsed.day);
  const b = reduceToArcanaNumber(parsed.month);
  const c = reduceToArcanaNumber(sumDigits(parsed.year));
  const g = reduceToArcanaNumber(a + b + c);
  const x = reduceToArcanaNumber(a + b + c + g);
  const love = reduceToArcanaNumber(a + x);
  const sky = reduceToArcanaNumber(b + x);
  const money = reduceToArcanaNumber(c + x);
  const mid = reduceToArcanaNumber(g + x);
  const tip = reduceToArcanaNumber(g + mid);
  const ab = reduceToArcanaNumber(a + b);
  const bc = reduceToArcanaNumber(b + c);
  const cg = reduceToArcanaNumber(c + g);
  const ga = reduceToArcanaNumber(g + a);
  const paternal = reduceToArcanaNumber(a + c);
  const maternal = reduceToArcanaNumber(b + c);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const yearArcana = reduceToArcanaNumber(a + b + sumDigits(year));
  const monthArcana = reduceToArcanaNumber(yearArcana + month);

  // Age belt: corners every 10y, midpoints every +5 — same as site.
  const perimeter = [a, ab, b, bc, c, cg, g, ga];
  const agePoints: Array<{ age: number; n: number }> = [];
  for (let i = 0; i < 8; i++) {
    agePoints.push({ age: i * 10, n: perimeter[i]! });
    agePoints.push({
      age: i * 10 + 5,
      n: reduceToArcanaNumber(perimeter[i]! + perimeter[(i + 1) % 8]!),
    });
  }
  agePoints.sort((p, q) => p.age - q.age);
  const chronologicalAge = yearsBetween(parsed, now);
  let age = agePoints[0]!.n;
  for (const pt of agePoints) {
    if (pt.age <= chronologicalAge) age = pt.n;
    else break;
  }

  // Period focus — same weights as site destiny-matrix pickFocus.
  const focusCandidates: Array<{ key: string; n: number; weight: number }> = [
    { key: "karma", n: g, weight: 3 },
    { key: "karmicMid", n: mid, weight: 2.5 },
    { key: "karmicTip", n: tip, weight: 2 },
    { key: "money", n: money, weight: 2 },
    { key: "relationships", n: love, weight: 2 },
    { key: "ageCurrent", n: age, weight: 2 },
    { key: "purpose", n: x, weight: 1 },
    { key: "yearArcana", n: yearArcana, weight: 1.5 },
    { key: "monthArcana", n: monthArcana, weight: 1.5 },
  ];
  let focusKey = focusCandidates[0]!.key;
  let bestScore = -1;
  for (const c of focusCandidates) {
    let score = c.weight;
    if (c.n === yearArcana) score += 3;
    if (c.n === monthArcana) score += 2;
    if (score > bestScore) {
      bestScore = score;
      focusKey = c.key;
    }
  }

  const points = {
    a,
    b,
    c,
    g,
    x,
    love,
    sky,
    money,
    mid,
    tip,
    ab,
    paternal,
    maternal,
    yearArcana,
    monthArcana,
    age,
  };

  const slots: MatrixDiagramSlot[] = SLOTS.map((slot) => {
    const number = slot.pick(points);
    return {
      key: slot.key,
      label: slot.label,
      area: slot.area,
      featured: Boolean(slot.featured),
      number,
      arcanaName: arcanaName(number),
    };
  });

  return {
    name: name?.trim() || null,
    birthDate,
    slots,
    focusKey,
  };
}
