/**
 * Frozen matrix-v3 engine. Do not change formulas — purchased reports replay through this.
 */
import { parseBirthDate, sumDigits } from "./constants";
import { arcanaForNumber } from "./matrix-arcana-map";
import {
  MATRIX_RENDERER_VERSION,
  MATRIX_V3_CALCULATION_VERSION,
  MATRIX_V3_METHODOLOGY_ID,
  type DestinyMatrixOptions,
  type DestinyMatrixResult,
} from "./matrix-result";
import { reduceToArcanaSubtract22 } from "./matrix-reducers";
import {
  buildAgeBelt,
  pickAgeWindow,
  pickFocus,
  resolveAsOf,
  toIsoDay,
  yearsBetween,
} from "./destiny-matrix-internal";

export function computeDestinyMatrixV3(
  birthDate: string,
  options?: DestinyMatrixOptions
): DestinyMatrixResult | null {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;
  const asOf = resolveAsOf(options);
  const reduce = reduceToArcanaSubtract22;
  const point = (n: number) => arcanaForNumber(n, MATRIX_V3_CALCULATION_VERSION);

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
  const paternalN = reduce(a + c);
  const maternalN = reduce(b + c);
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
  const paternal = point(paternalN);
  const maternal = point(maternalN);
  const yearArcana = point(yearArcanaN);
  const monthArcana = point(monthArcanaN);
  const skySpirit = point(skyInner);
  const earthTask = karmicMid;
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
    methodologyId: MATRIX_V3_METHODOLOGY_ID,
    calculationVersion: MATRIX_V3_CALCULATION_VERSION,
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
    channels: [
      { id: "money", label: "Денежный канал", points: [skySpirit, comfort, money, earthTask] },
      { id: "love", label: "Канал отношений", points: [body, relationships, comfort, money] },
      { id: "male", label: "Мужская / отцовская линия", points: [body, paternal, roots, point(cg)] },
      { id: "female", label: "Женская / материнская линия", points: [energy, maternal, talents, point(ga)] },
      { id: "skyEarth", label: "Небо — Земля", points: [energy, skySpirit, comfort, earthTask, karma] },
    ],
    focusKey: focus.focusKey,
    focusLabel: focus.focusLabel,
    asOf: { year: asOf.year, month: asOf.month, date: toIsoDay(asOf.date) },
  };
}
