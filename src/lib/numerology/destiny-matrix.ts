import { parseBirthDate, sumDigits } from "./constants";
import { computeDestinyMatrixV3 } from "./destiny-matrix-v3";
import {
  AGE_BELT_END,
  buildAgeBelt,
  pickAgeWindow,
  pickFocus,
  resolveAsOf,
  toIsoDay,
  yearsBetween,
} from "./destiny-matrix-internal";
import { arcanaForNumber } from "./matrix-arcana-map";
import { MATRIX_CHANNEL_DEFINITIONS } from "./matrix-channels";
import { formatAgePeriodLabel, MATRIX_LABELS } from "./matrix-labels";
import { reduceToArcanaNumber } from "./matrix-reducers";
import {
  MATRIX_CALCULATION_VERSION,
  MATRIX_METHODOLOGY_ID,
  MATRIX_RENDERER_VERSION,
  matrixBaseVersion,
  type DestinyMatrixChannel,
  type DestinyMatrixOptions,
  type DestinyMatrixPoint,
  type DestinyMatrixResult,
} from "./matrix-result";

export { AGE_BELT_END } from "./destiny-matrix-internal";
export {
  MATRIX_CALCULATION_VERSION,
  MATRIX_LEGACY_CALCULATION_VERSIONS,
  MATRIX_METHODOLOGY_ID,
  MATRIX_RENDERER_VERSION,
  MATRIX_V3_CALCULATION_VERSION,
  MATRIX_V3_METHODOLOGY_ID,
  DESTINY_MATRIX_POINT_KEYS,
  isFrozenReplayVersion,
  isLegacyMatrixCalculationVersion,
  methodologyIdForCalculationVersion,
  matrixBaseVersion,
} from "./matrix-result";
export type {
  DestinyMatrixAgePoint,
  DestinyMatrixChannel,
  DestinyMatrixChannelId,
  DestinyMatrixOptions,
  DestinyMatrixPoint,
  DestinyMatrixResult,
  MatrixEngineVersion,
  MatrixMethodologyId,
} from "./matrix-result";
export { reduceToArcanaNumber, reduceToArcanaDigitSum, reduceToArcanaSubtract22 } from "./matrix-reducers";
export { arcanaForNumber, getMatrixArcanaEntry, MATRIX_ARCANA_DICTIONARY } from "./matrix-arcana-map";

function computeDestinyMatrixV4(
  birthDate: string,
  options?: DestinyMatrixOptions
): DestinyMatrixResult | null {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;
  const asOf = resolveAsOf(options);
  const reduce = reduceToArcanaNumber;
  const point = (n: number) => arcanaForNumber(n, MATRIX_CALCULATION_VERSION);

  const a = reduce(parsed.day);
  const b = reduce(parsed.month);
  const c = reduce(sumDigits(parsed.year));
  const g = reduce(a + b + c);
  const x = reduce(a + b + c + g);
  const loveInner = reduce(a + x);
  const skyInner = reduce(b + x);
  const moneyInner = reduce(c + x);
  const earthInner = reduce(g + x);
  const ab = reduce(a + b);
  const bc = reduce(b + c);
  const cg = reduce(c + g);
  const ga = reduce(g + a);
  const karmicTip = reduce(g + earthInner);
  const yearArcanaN = reduce(a + b + sumDigits(asOf.year));
  const monthArcanaN = reduce(yearArcanaN + asOf.month);

  const perimeter = [a, ab, b, bc, c, cg, g, ga];
  const agePoints = buildAgeBelt(perimeter, reduce, point);
  const chronologicalAge = yearsBetween(parsed, asOf.date);
  const { ageCurrent, ageNext } = pickAgeWindow(agePoints, chronologicalAge);

  const body = point(a);
  const energy = point(b);
  const roots = point(c);
  const comfort = point(x);
  const karma = point(g);
  const karmicMid = point(earthInner);
  const karmicTipPt = point(karmicTip);
  const relationships = point(loveInner);
  const money = point(moneyInner);
  const talents = point(ab);
  const paternal = point(cg);
  const maternal = point(bc);
  const yearArcana = point(yearArcanaN);
  const monthArcana = point(monthArcanaN);
  const skySpirit = point(skyInner);
  const earthTask = karmicMid;
  const gaPoint = point(ga);
  const focus = pickFocus({
    yearN: yearArcanaN,
    monthN: monthArcanaN,
    comfortN: x,
    moneyN: moneyInner,
    loveN: loveInner,
    tail: [g, earthInner, karmicTip],
    ageN: ageCurrent.number,
  });

  const byId: Record<string, DestinyMatrixPoint> = {
    body,
    energy,
    roots,
    comfort,
    relationships,
    money,
    talents,
    paternal,
    maternal,
    skySpirit,
    earthTask,
    karma,
    karmicTip: karmicTipPt,
    "lineage.ga": gaPoint,
  };

  return {
    methodologyId: MATRIX_METHODOLOGY_ID,
    calculationVersion: MATRIX_CALCULATION_VERSION,
    rendererVersion: MATRIX_RENDERER_VERSION,
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
    chronologicalAge,
    channels: MATRIX_CHANNEL_DEFINITIONS.filter(
      (def): def is typeof def & { id: DestinyMatrixChannel["id"] } => def.id !== "karmicTail"
    ).map((def) => ({
      id: def.id,
      label: def.label,
      points: def.pointIds.map((id) => byId[id] ?? comfort),
    })),
    focusKey: focus.focusKey,
    focusLabel: focus.focusLabel,
    asOf: { year: asOf.year, month: asOf.month, date: toIsoDay(asOf.date) },
  };
}

export function destinyMatrix(
  birthDate: string,
  options?: DestinyMatrixOptions
): DestinyMatrixResult | null {
  const requested = matrixBaseVersion(options?.calculationVersion);
  if (requested === "matrix-v3") {
    return computeDestinyMatrixV3(birthDate, options);
  }
  if (requested === "matrix-v1" || requested === "matrix-v2") {
    return null;
  }
  return computeDestinyMatrixV4(birthDate, options);
}

export const DESTINY_MATRIX_DIAGRAM_SLOTS: Array<{
  key: keyof DestinyMatrixResult | "karmicMid" | "karmicTip" | "ageCurrent" | "monthArcana" | "skySpirit";
  label: string;
  area: string;
  featured?: boolean;
  pick: (m: DestinyMatrixResult) => DestinyMatrixPoint;
}> = [
  { key: "energy", label: MATRIX_LABELS.energyLong, area: "energy", pick: (m) => m.energy },
  { key: "skySpirit", label: MATRIX_LABELS.skySpirit, area: "sky", pick: (m) => m.skySpirit },
  { key: "body", label: MATRIX_LABELS.body, area: "body", pick: (m) => m.body },
  {
    key: "purpose",
    label: MATRIX_LABELS.comfort,
    area: "purpose",
    featured: true,
    pick: (m) => m.purpose,
  },
  { key: "roots", label: MATRIX_LABELS.rootsLong, area: "roots", pick: (m) => m.roots },
  { key: "talents", label: MATRIX_LABELS.talents, area: "talents", pick: (m) => m.talents },
  { key: "relationships", label: MATRIX_LABELS.relationships, area: "rel", pick: (m) => m.relationships },
  { key: "money", label: MATRIX_LABELS.money, area: "money", pick: (m) => m.money },
  { key: "paternal", label: MATRIX_LABELS.paternal, area: "paternal", pick: (m) => m.paternal },
  { key: "maternal", label: MATRIX_LABELS.maternal, area: "maternal", pick: (m) => m.maternal },
  { key: "karma", label: MATRIX_LABELS.karma, area: "karma", pick: (m) => m.karmicTail[0] },
  { key: "karmicMid", label: MATRIX_LABELS.karmicMid, area: "tailMid", pick: (m) => m.karmicTail[1] },
  { key: "karmicTip", label: MATRIX_LABELS.karmicTip, area: "tailTip", pick: (m) => m.karmicTail[2] },
  {
    key: "ageCurrent",
    label: MATRIX_LABELS.agePeriod,
    area: "age",
    pick: (m) => arcanaForNumber(m.ageCurrent.number, m.calculationVersion),
  },
  { key: "yearArcana", label: MATRIX_LABELS.yearArcana, area: "year", pick: (m) => m.yearArcana },
  { key: "monthArcana", label: MATRIX_LABELS.monthArcana, area: "month", pick: (m) => m.monthArcana },
];

export const DESTINY_MATRIX_UI_SLOT_COUNT = DESTINY_MATRIX_DIAGRAM_SLOTS.length;

export function matrixOptionsForTimestamp(
  timestamp: string | null | undefined
): DestinyMatrixOptions | undefined {
  const day = timestamp?.slice(0, 10);
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? { asOfDate: day } : undefined;
}

export function formatDestinyMatrixAscii(m: DestinyMatrixResult): string {
  const periodEnd = m.ageNext?.age ?? m.ageCurrent.age + 5;
  return [
    `${MATRIX_LABELS.methodologyName} (${m.calculationVersion}):`,
    `${MATRIX_LABELS.body}: ${m.body.number} — ${m.body.arcanaName}`,
    `${MATRIX_LABELS.energyLong}: ${m.energy.number} — ${m.energy.arcanaName}`,
    `${MATRIX_LABELS.rootsLong}: ${m.roots.number} — ${m.roots.arcanaName}`,
    `${MATRIX_LABELS.comfort}: ${m.comfort.number} — ${m.comfort.arcanaName}`,
    `Кармический хвост: ${m.karmicTail.map((p) => `${p.number} ${p.arcanaName}`).join(" → ")}`,
    `${MATRIX_LABELS.talents}: ${m.talents.number} — ${m.talents.arcanaName}`,
    `${MATRIX_LABELS.relationships}: ${m.relationships.number} — ${m.relationships.arcanaName}`,
    `${MATRIX_LABELS.money}: ${m.money.number} — ${m.money.arcanaName}`,
    `${MATRIX_LABELS.paternal}: ${m.paternal.number} — ${m.paternal.arcanaName}`,
    `${MATRIX_LABELS.maternal}: ${m.maternal.number} — ${m.maternal.arcanaName}`,
    `${formatAgePeriodLabel(m.ageCurrent.age, periodEnd)}: ${m.ageCurrent.number} — ${m.ageCurrent.arcanaName}`,
    `${MATRIX_LABELS.yearArcana}: ${m.yearArcana.number} — ${m.yearArcana.arcanaName}`,
    `${MATRIX_LABELS.monthArcana}: ${m.monthArcana.number} — ${m.monthArcana.arcanaName}`,
    `${m.focusLabel}`,
  ].join("\n");
}

export function matrixToStructuredData(m: DestinyMatrixResult): Record<string, unknown> {
  const point = (p: DestinyMatrixPoint) => ({
    number: p.number,
    arcanaName: p.arcanaName,
    arcanaMeaning: p.arcanaMeaning,
  });
  return {
    methodologyId: m.methodologyId,
    version: m.calculationVersion,
    calculationVersion: m.calculationVersion,
    rendererVersion: m.rendererVersion,
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
    chronologicalAge: m.chronologicalAge,
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
