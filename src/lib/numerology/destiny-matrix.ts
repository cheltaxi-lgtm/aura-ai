import { parseBirthDate, sumDigits } from "./constants";
import { MAJOR_ARCANA } from "../tarot";
import { getArcanaEntry } from "./arcana-dictionary";

/**
 * matrix-v3 — full popular 22-arcana destiny matrix (octagram zones).
 * Public-method adaptation (Ladini-school topology): corners, comfort center,
 * 3-point karmic tail, money/love/lineage channels, age belt, period arcs.
 * Not a licensed Ladini product — Zovus entertainment / self-reflection.
 */
export const MATRIX_CALCULATION_VERSION = "matrix-v3" as const;

/** Versions whose stored numbers came from the pre-canonical digit-sum reducer. */
export const MATRIX_LEGACY_CALCULATION_VERSIONS = ["matrix-v1", "matrix-v2"] as const;

/**
 * True when a saved report was computed with the old digit-sum reducer, so its
 * numbers can no longer be reproduced. Such reports must be rebuilt for free.
 * Period-scoped versions carry an "@year" suffix ("matrix-v2@2026").
 */
export function isLegacyMatrixCalculationVersion(
  version: string | null | undefined
): boolean {
  const base = String(version ?? "").split("@")[0]?.trim();
  if (!base) return false;
  return (MATRIX_LEGACY_CALCULATION_VERSIONS as readonly string[]).includes(base);
}

export interface DestinyMatrixPoint {
  number: number;
  arcanaName: string;
  arcanaMeaning: string;
}

export interface DestinyMatrixAgePoint {
  age: number;
  number: number;
  arcanaName: string;
  arcanaMeaning: string;
}

export type DestinyMatrixChannelId =
  | "money"
  | "love"
  | "male"
  | "female"
  | "skyEarth";

export interface DestinyMatrixChannel {
  id: DestinyMatrixChannelId;
  label: string;
  /** Ordered energies along the channel (2–5 points). */
  points: DestinyMatrixPoint[];
}

/**
 * Full matrix result. Legacy v1 keys remain for session/UI compat;
 * purpose = comfort center; karma = karmic tail root (earth).
 */
export interface DestinyMatrixResult {
  body: DestinyMatrixPoint;
  energy: DestinyMatrixPoint;
  roots: DestinyMatrixPoint;
  /** Comfort / personal power center (A+B+C+G). */
  purpose: DestinyMatrixPoint;
  relationships: DestinyMatrixPoint;
  money: DestinyMatrixPoint;
  /** Karmic tail root (earth corner). */
  karma: DestinyMatrixPoint;
  talents: DestinyMatrixPoint;
  paternal: DestinyMatrixPoint;
  maternal: DestinyMatrixPoint;
  yearArcana: DestinyMatrixPoint;
  /** Alias of purpose — explicit comfort zone. */
  comfort: DestinyMatrixPoint;
  /** Earth → mid → tip. */
  karmicTail: [DestinyMatrixPoint, DestinyMatrixPoint, DestinyMatrixPoint];
  /** Top-inner (month + comfort) — spiritual / sky pole. */
  skySpirit: DestinyMatrixPoint;
  /** Bottom-inner (earth + comfort) — same as karmicTail[1]. */
  earthTask: DestinyMatrixPoint;
  monthArcana: DestinyMatrixPoint;
  agePoints: DestinyMatrixAgePoint[];
  ageCurrent: DestinyMatrixAgePoint;
  ageNext: DestinyMatrixAgePoint | null;
  channels: DestinyMatrixChannel[];
  focusKey: string;
  focusLabel: string;
  /**
   * Calendar anchor behind yearArcana / monthArcana / ageCurrent. Persist it with
   * a saved reading and replay it via `asOfDate`, otherwise the diagram silently
   * re-dates itself and stops matching the text.
   */
  asOf: { year: number; month: number; date: string };
}

/** Core keys used by older UI that only expects the v1 cross. */
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
  /** Freeze calendar year for yearArcana / age. Defaults to now. */
  asOfYear?: number;
  /** Freeze calendar month 1–12 for monthArcana. Defaults to now. */
  asOfMonth?: number;
  /** Freeze "today" for age current (ISO date). */
  asOfDate?: string;
};

/**
 * Reduces any sum to the 1–22 range used by the 22-arcana method.
 * 0 wraps to 22 (Шут/The Fool).
 *
 * Canonical convention: subtract 22 until the value fits. Digit-sum folding
 * (used up to matrix-v2) caps at 18 for any two-digit input, which made the
 * high arcana unreachable and skewed the whole belt toward mid arcana.
 */
export function reduceToArcanaNumber(n: number): number {
  let value = Math.abs(Math.trunc(n));
  while (value > 22) {
    value -= 22;
  }
  return value === 0 ? 22 : value;
}

/**
 * Arcana numbers run 1–22; id 0 (Шут) represents 22.
 * Display name SSOT for matrix = ARCANA_DICTIONARY (Rider–Waite: 8 Сила, 11 Справедливость).
 * Meanings stay on MAJOR_ARCANA so deck copy can diverge from matrix editorial text.
 */
export function arcanaForNumber(n: number): DestinyMatrixPoint {
  const card = n === 22 ? MAJOR_ARCANA[0] : MAJOR_ARCANA[n];
  const entry = getArcanaEntry(n);
  return {
    number: n,
    arcanaName: entry?.title ?? card?.name ?? `Аркан ${n}`,
    arcanaMeaning: card?.meaning ?? "",
  };
}

/** The octagram age belt is a full 0–80 life cycle; 80 lands back on point A. */
export const AGE_BELT_END = 80;

function agePoint(age: number, n: number): DestinyMatrixAgePoint {
  const p = arcanaForNumber(n);
  return { age, number: p.number, arcanaName: p.arcanaName, arcanaMeaning: p.arcanaMeaning };
}

function yearsBetween(birth: { year: number; month: number; day: number }, asOf: Date): number {
  let age = asOf.getFullYear() - birth.year;
  const m = asOf.getMonth() + 1;
  const d = asOf.getDate();
  if (m < birth.month || (m === birth.month && d < birth.day)) age -= 1;
  return Math.max(0, age);
}

function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveAsOf(options?: DestinyMatrixOptions): {
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

const FOCUS_LABELS: Record<string, string> = {
  karma: "Кармический хвост",
  karmicMid: "Кармический хвост (середина)",
  karmicTip: "Кармический хвост (остриё)",
  money: "Денежный канал",
  relationships: "Канал отношений",
  ageCurrent: "Точка возраста",
  purpose: "Зона комфорта",
  yearArcana: "Аркан года",
  monthArcana: "Аркан месяца",
};

function pickFocus(input: {
  yearN: number;
  monthN: number;
  comfortN: number;
  moneyN: number;
  loveN: number;
  tail: [number, number, number];
  ageN: number;
}): { focusKey: string; focusLabel: string } {
  // Age point leads without resonance: it is the literal marker of the period.
  // A karmic/money/love point overtakes it only when it echoes the year arcana.
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
    // Resonance bonus only for personal points that echo the period arcana —
    // the year/month candidates match themselves, so self-matches score 0.
    if (c.key !== "yearArcana" && c.n === input.yearN) score += 3;
    if (c.key !== "monthArcana" && c.n === input.monthN) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return {
    focusKey: best.key,
    focusLabel: FOCUS_LABELS[best.key] ?? best.key,
  };
}

/**
 * Full destiny matrix by birth date (matrix-v2).
 */
export function destinyMatrix(
  birthDate: string,
  options?: DestinyMatrixOptions
): DestinyMatrixResult | null {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;

  const asOf = resolveAsOf(options);

  // Personal (diagonal) square — classic A/B/C/G/comfort.
  const a = reduceToArcanaNumber(parsed.day);
  const b = reduceToArcanaNumber(parsed.month);
  const c = reduceToArcanaNumber(sumDigits(parsed.year));
  const g = reduceToArcanaNumber(a + b + c); // earth / karmic root
  const x = reduceToArcanaNumber(a + b + c + g); // comfort center

  // Inner ring (corner + center)
  const loveInner = reduceToArcanaNumber(a + x); // left
  const skyInner = reduceToArcanaNumber(b + x); // top
  const moneyInner = reduceToArcanaNumber(c + x); // right
  const earthInner = reduceToArcanaNumber(g + x); // bottom mid-tail

  // Outer edge midpoints
  const ab = reduceToArcanaNumber(a + b);
  const bc = reduceToArcanaNumber(b + c);
  const cg = reduceToArcanaNumber(c + g);
  const ga = reduceToArcanaNumber(g + a);

  // Karmic tip
  const karmicTip = reduceToArcanaNumber(g + earthInner);

  // Lineage heads (male/father ≈ day+year; female/mother ≈ month+year)
  const paternalN = reduceToArcanaNumber(a + c);
  const maternalN = reduceToArcanaNumber(b + c);

  // Period
  const yearArcanaN = reduceToArcanaNumber(a + b + sumDigits(asOf.year));
  const monthArcanaN = reduceToArcanaNumber(yearArcanaN + asOf.month);

  // Age belt on octagram perimeter (corners every 10y, midpoints every +5).
  // Order clockwise from character (A) = age 0; the belt closes at 80 back on A.
  const perimeter = [a, ab, b, bc, c, cg, g, ga];
  const agePoints: DestinyMatrixAgePoint[] = [];
  for (let i = 0; i < 8; i++) {
    agePoints.push(agePoint(i * 10, perimeter[i]!));
    const mid = reduceToArcanaNumber(perimeter[i]! + perimeter[(i + 1) % 8]!);
    agePoints.push(agePoint(i * 10 + 5, mid));
  }
  agePoints.push(agePoint(AGE_BELT_END, perimeter[0]!));
  agePoints.sort((p, q) => p.age - q.age);

  const chronologicalAge = yearsBetween(parsed, asOf.date);
  let ageCurrent = agePoints[0]!;
  let ageNext: DestinyMatrixAgePoint | null = agePoints[1] ?? null;
  for (let i = 0; i < agePoints.length; i++) {
    const pt = agePoints[i]!;
    if (pt.age <= chronologicalAge) {
      ageCurrent = pt;
      ageNext = agePoints[i + 1] ?? null;
    } else break;
  }

  const body = arcanaForNumber(a);
  const energy = arcanaForNumber(b);
  const roots = arcanaForNumber(c);
  const comfort = arcanaForNumber(x);
  const karma = arcanaForNumber(g);
  const karmicMid = arcanaForNumber(earthInner);
  const karmicTipPt = arcanaForNumber(karmicTip);
  const relationships = arcanaForNumber(loveInner);
  const money = arcanaForNumber(moneyInner);
  const talents = arcanaForNumber(ab);
  const paternal = arcanaForNumber(paternalN);
  const maternal = arcanaForNumber(maternalN);
  const yearArcana = arcanaForNumber(yearArcanaN);
  const monthArcana = arcanaForNumber(monthArcanaN);
  const skySpirit = arcanaForNumber(skyInner);
  const earthTask = karmicMid;

  const channels: DestinyMatrixChannel[] = [
    {
      id: "money",
      label: "Денежный канал",
      points: [skySpirit, comfort, money, earthTask].map((p) =>
        arcanaForNumber(p.number)
      ),
    },
    {
      id: "love",
      label: "Канал отношений",
      points: [body, relationships, comfort, money].map((p) =>
        arcanaForNumber(p.number)
      ),
    },
    {
      id: "male",
      label: "Мужская / отцовская линия",
      points: [body, paternal, roots, arcanaForNumber(cg)],
    },
    {
      id: "female",
      label: "Женская / материнская линия",
      points: [energy, maternal, talents, arcanaForNumber(ga)],
    },
    {
      id: "skyEarth",
      label: "Небо — Земля",
      points: [energy, skySpirit, comfort, earthTask, karma],
    },
  ];

  const focus = pickFocus({
    yearN: yearArcanaN,
    monthN: monthArcanaN,
    comfortN: x,
    moneyN: moneyInner,
    loveN: loveInner,
    tail: [g, earthInner, karmicTip],
    ageN: ageCurrent.number,
  });

  return {
    body,
    energy,
    roots,
    purpose: comfort,
    relationships,
    money,
    karma,
    talents,
    paternal,
    maternal,
    yearArcana,
    comfort,
    karmicTail: [karma, karmicMid, karmicTipPt],
    skySpirit,
    earthTask,
    monthArcana,
    agePoints,
    ageCurrent,
    ageNext,
    channels,
    focusKey: focus.focusKey,
    focusLabel: focus.focusLabel,
    asOf: { year: asOf.year, month: asOf.month, date: toIsoDay(asOf.date) },
  };
}

/** Diagram slots for site grid + Telegram renderer (full matrix-v2). */
export const DESTINY_MATRIX_DIAGRAM_SLOTS: Array<{
  key: keyof DestinyMatrixResult | "karmicMid" | "karmicTip" | "ageCurrent" | "monthArcana" | "skySpirit";
  label: string;
  area: string;
  featured?: boolean;
  pick: (m: DestinyMatrixResult) => DestinyMatrixPoint;
}> = [
  { key: "energy", label: "Небо / энергия", area: "energy", pick: (m) => m.energy },
  { key: "skySpirit", label: "Дух", area: "sky", pick: (m) => m.skySpirit },
  { key: "body", label: "Характер", area: "body", pick: (m) => m.body },
  {
    key: "purpose",
    label: "Зона комфорта",
    area: "purpose",
    featured: true,
    pick: (m) => m.purpose,
  },
  { key: "roots", label: "Материя / год", area: "roots", pick: (m) => m.roots },
  { key: "talents", label: "Таланты", area: "talents", pick: (m) => m.talents },
  { key: "relationships", label: "Отношения", area: "rel", pick: (m) => m.relationships },
  { key: "money", label: "Деньги", area: "money", pick: (m) => m.money },
  { key: "paternal", label: "Род отца", area: "paternal", pick: (m) => m.paternal },
  { key: "maternal", label: "Род матери", area: "maternal", pick: (m) => m.maternal },
  { key: "karma", label: "Хвост · корень", area: "karma", pick: (m) => m.karmicTail[0] },
  {
    key: "karmicMid",
    label: "Хвост · середина",
    area: "tailMid",
    pick: (m) => m.karmicTail[1],
  },
  {
    key: "karmicTip",
    label: "Хвост · остриё",
    area: "tailTip",
    pick: (m) => m.karmicTail[2],
  },
  {
    key: "ageCurrent",
    label: "Возраст сейчас",
    area: "age",
    pick: (m) => arcanaForNumber(m.ageCurrent.number),
  },
  { key: "yearArcana", label: "Аркан года", area: "year", pick: (m) => m.yearArcana },
  {
    key: "monthArcana",
    label: "Аркан месяца",
    area: "month",
    pick: (m) => m.monthArcana,
  },
];

export const DESTINY_MATRIX_UI_SLOT_COUNT = DESTINY_MATRIX_DIAGRAM_SLOTS.length;

/**
 * Freezes a stored reading's diagram to the day it was generated, so the year /
 * month / age points keep matching the saved text instead of silently re-dating.
 */
export function matrixOptionsForTimestamp(
  timestamp: string | null | undefined
): DestinyMatrixOptions | undefined {
  const day = timestamp?.slice(0, 10);
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? { asOfDate: day } : undefined;
}

export function formatDestinyMatrixAscii(m: DestinyMatrixResult): string {
  return [
    `Матрица судьбы (${MATRIX_CALCULATION_VERSION}, полная, 22 аркана):`,
    `Характер: ${m.body.number} — ${m.body.arcanaName}`,
    `Небо/энергия: ${m.energy.number} — ${m.energy.arcanaName}`,
    `Материя/год: ${m.roots.number} — ${m.roots.arcanaName}`,
    `Зона комфорта: ${m.comfort.number} — ${m.comfort.arcanaName}`,
    `Кармический хвост: ${m.karmicTail.map((p) => `${p.number} ${p.arcanaName}`).join(" → ")}`,
    `Таланты: ${m.talents.number} — ${m.talents.arcanaName}`,
    `Отношения: ${m.relationships.number} — ${m.relationships.arcanaName}`,
    `Деньги: ${m.money.number} — ${m.money.arcanaName}`,
    `Род отца: ${m.paternal.number} — ${m.paternal.arcanaName}`,
    `Род матери: ${m.maternal.number} — ${m.maternal.arcanaName}`,
    `Возраст ${m.ageCurrent.age}: ${m.ageCurrent.number} — ${m.ageCurrent.arcanaName}`,
    `Аркан года: ${m.yearArcana.number} — ${m.yearArcana.arcanaName}`,
    `Аркан месяца: ${m.monthArcana.number} — ${m.monthArcana.arcanaName}`,
    `Узел периода: ${m.focusLabel}`,
  ].join("\n");
}

/** Serialize for numerology_report_history.structured_data */
export function matrixToStructuredData(m: DestinyMatrixResult): Record<string, unknown> {
  const point = (p: DestinyMatrixPoint) => ({
    number: p.number,
    arcanaName: p.arcanaName,
  });
  return {
    version: MATRIX_CALCULATION_VERSION,
    body: point(m.body),
    energy: point(m.energy),
    roots: point(m.roots),
    purpose: point(m.purpose),
    comfort: point(m.comfort),
    relationships: point(m.relationships),
    money: point(m.money),
    karma: point(m.karma),
    talents: point(m.talents),
    paternal: point(m.paternal),
    maternal: point(m.maternal),
    yearArcana: point(m.yearArcana),
    monthArcana: point(m.monthArcana),
    karmicTail: m.karmicTail.map(point),
    skySpirit: point(m.skySpirit),
    earthTask: point(m.earthTask),
    ageCurrent: m.ageCurrent,
    ageNext: m.ageNext,
    agePoints: m.agePoints,
    channels: m.channels.map((ch) => ({
      id: ch.id,
      label: ch.label,
      points: ch.points.map(point),
    })),
    focusKey: m.focusKey,
    focusLabel: m.focusLabel,
    asOf: m.asOf,
  };
}
