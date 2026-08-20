/**
 * Frozen production methodology matrix-v4 / zovus-matrix-22-v1.
 * Do not mutate formulas. Purchased reports replay through this file only.
 */
import { parseBirthDate, sumDigits } from "./constants";
import {
  legacyBuildAgeBelt,
  legacyPickAgeWindow,
  legacyPickFocus,
  legacyResolveAsOf,
  legacyToIsoDay,
  legacyYearsBetween,
} from "./destiny-matrix-legacy-helpers";
import { arcanaForNumber } from "./matrix-arcana-map";
import { matrixCalendarDate } from "./matrix-calendar";
import { MATRIX_CHANNEL_DEFINITIONS } from "./matrix-channels";
import { reduceToArcanaDigitSum } from "./matrix-reducers";
import {
  MATRIX_V4_CALCULATION_VERSION,
  MATRIX_V4_METHODOLOGY_ID,
  MATRIX_V4_RENDERER_VERSION,
  type DestinyMatrixChannel,
  type DestinyMatrixOptions,
  type DestinyMatrixPoint,
  type DestinyMatrixResult,
} from "./matrix-result";

export function computeDestinyMatrixV4(
  birthDate: string,
  options?: DestinyMatrixOptions
): DestinyMatrixResult | null {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;
  const asOf =
    legacyResolveAsOf(options) ?? legacyResolveAsOf({ asOfDate: matrixCalendarDate() });
  if (!asOf) return null;
  const reduce = reduceToArcanaDigitSum;
  const point = (n: number) => arcanaForNumber(n, MATRIX_V4_CALCULATION_VERSION);

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
  const agePoints = legacyBuildAgeBelt(perimeter, reduce, point);
  const chronologicalAge = legacyYearsBetween(parsed, asOf.date);
  const { ageCurrent, ageNext } = legacyPickAgeWindow(agePoints, chronologicalAge);

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
  const focus = legacyPickFocus({
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
    methodologyId: MATRIX_V4_METHODOLOGY_ID,
    calculationVersion: MATRIX_V4_CALCULATION_VERSION,
    rendererVersion: MATRIX_V4_RENDERER_VERSION,
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
    asOf: { year: asOf.year, month: asOf.month, date: legacyToIsoDay(asOf.date) },
  };
}
