import { FULL_DECK } from "../deck/cards.js";
import type { MatrixDiagramInput, MatrixDiagramSlot } from "../../render/matrix-diagram.js";

/** Same reduce as site matrix-v1 (1–22; 0 → 22). */
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

/** Mapping matches site `destinyMatrix` matrix-v1. */
const SLOTS: Array<{
  key: string;
  label: string;
  area: string;
  featured?: boolean;
  pick: (p: Record<string, number>) => number;
}> = [
  { key: "energy", label: "Энергия", area: "energy", pick: (p) => p.b! },
  { key: "body", label: "Тело и характер", area: "body", pick: (p) => p.a! },
  {
    key: "purpose",
    label: "Предназначение",
    area: "purpose",
    featured: true,
    pick: (p) => p.d!,
  },
  { key: "roots", label: "Род и корни", area: "roots", pick: (p) => p.c! },
  { key: "talents", label: "Таланты", area: "talents", pick: (p) => p.talents! },
  { key: "relationships", label: "Отношения", area: "rel", pick: (p) => p.e! },
  { key: "money", label: "Деньги", area: "money", pick: (p) => p.f! },
  { key: "paternal", label: "Род отца", area: "paternal", pick: (p) => p.paternal! },
  { key: "maternal", label: "Род матери", area: "maternal", pick: (p) => p.maternal! },
  { key: "karma", label: "Карма", area: "karma", pick: (p) => p.g! },
  { key: "yearArcana", label: "Аркан года", area: "year", pick: (p) => p.yearArcana! },
];

/**
 * Local fallback matching site `destinyMatrix` matrix-v1 when API omits `diagram`.
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
  const d = reduceToArcanaNumber(a + b + c);
  const e = reduceToArcanaNumber(a + d);
  const f = reduceToArcanaNumber(b + d);
  const g = reduceToArcanaNumber(c + d);
  const talents = reduceToArcanaNumber(a + b);
  const paternal = reduceToArcanaNumber(a + c);
  const maternal = reduceToArcanaNumber(b + c);
  const year = new Date().getFullYear();
  const yearArcana = reduceToArcanaNumber(a + b + sumDigits(year));
  const points = { a, b, c, d, e, f, g, talents, paternal, maternal, yearArcana };

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
  };
}
