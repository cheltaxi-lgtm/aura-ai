/**
 * Live methodology matrix-v5 / zovus-matrix-22-v2.
 * Digit-sum reducer. Purpose, talent chain, and lineage are not aliases of comfort/AB.
 */
import { parseBirthDate, sumDigits } from "./constants";
import {
  buildAgeBelt,
  pickAgeWindow,
  pickFocus,
  resolveAsOf,
  toIsoDay,
  yearsBetween,
} from "./destiny-matrix-internal";
import { arcanaForNumber } from "./matrix-arcana-map";
import { MATRIX_LABELS } from "./matrix-labels";
import { reduceToArcanaDigitSum } from "./matrix-reducers";
import {
  MATRIX_CALCULATION_VERSION,
  MATRIX_METHODOLOGY_ID,
  MATRIX_RENDERER_VERSION,
  type DestinyMatrixOptions,
  type DestinyMatrixResult,
} from "./matrix-result";

export function computeDestinyMatrixV5(
  birthDate: string,
  options?: DestinyMatrixOptions
): DestinyMatrixResult | null {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;
  const asOf = resolveAsOf(options);
  const reduce = reduceToArcanaDigitSum;
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
  const loveDeepN = reduce(a + loveInner);
  const talentDeepN = reduce(b + skyInner);
  const moneyDeepN = reduce(c + moneyInner);
  const karmicTip = reduce(g + earthInner);

  const ab = reduce(a + b);
  const bc = reduce(b + c);
  const cg = reduce(c + g);
  const ga = reduce(g + a);

  const skyLineN = reduce(b + g);
  const earthLineN = reduce(a + c);
  const personalN = reduce(skyLineN + earthLineN);
  const maleChannelN = reduce(ab + cg);
  const femaleChannelN = reduce(bc + ga);
  const socialN = reduce(maleChannelN + femaleChannelN);
  const spiritualN = reduce(personalN + socialN);

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
  const talents = point(skyInner);
  const paternal = point(cg);
  const maternal = point(bc);
  const yearArcana = point(yearArcanaN);
  const monthArcana = point(monthArcanaN);
  const skySpirit = point(skyInner);
  const earthTask = karmicMid;
  const personal = point(personalN);
  const social = point(socialN);
  const spiritual = point(spiritualN);
  const skyLine = point(skyLineN);
  const earthLine = point(earthLineN);
  const maleChannel = point(maleChannelN);
  const femaleChannel = point(femaleChannelN);
  const talentPrimary = energy;
  const talentSecondary = talents;
  const talentTertiary = point(talentDeepN);
  const loveDeep = point(loveDeepN);
  const moneyDeep = point(moneyDeepN);
  const ancestralFatherSpirit = point(ab);
  const ancestralMotherMatter = point(ga);

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
    methodologyId: MATRIX_METHODOLOGY_ID,
    calculationVersion: MATRIX_CALCULATION_VERSION,
    rendererVersion: MATRIX_RENDERER_VERSION,
    body,
    energy,
    roots,
    purpose: personal,
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
      {
        id: "love",
        label: MATRIX_LABELS.loveChannel,
        points: [body, relationships, loveDeep, comfort, money],
      },
      {
        id: "money",
        label: MATRIX_LABELS.moneyChannel,
        points: [skySpirit, comfort, money, moneyDeep, earthTask],
      },
      {
        id: "male",
        label: MATRIX_LABELS.maleChannel,
        points: [ancestralFatherSpirit, maleChannel, paternal],
      },
      {
        id: "female",
        label: MATRIX_LABELS.femaleChannel,
        points: [maternal, femaleChannel, ancestralMotherMatter],
      },
      {
        id: "skyEarth",
        label: MATRIX_LABELS.skyEarthChannel,
        points: [energy, skySpirit, comfort, earthTask, karma],
      },
    ],
    focusKey: focus.focusKey,
    focusLabel: focus.focusLabel,
    asOf: { year: asOf.year, month: asOf.month, date: toIsoDay(asOf.date) },
    purposeBlock: {
      personal,
      social,
      spiritual,
      skyLine,
      earthLine,
      maleChannel,
      femaleChannel,
    },
    talentsChain: {
      primary: talentPrimary,
      secondary: talentSecondary,
      tertiary: talentTertiary,
    },
    lineage: {
      male: [ancestralFatherSpirit, maleChannel, paternal],
      female: [maternal, femaleChannel, ancestralMotherMatter],
    },
    ageModel: {
      chronological: chronologicalAge,
      periodStart: ageCurrent.age,
      periodEnd: ageNext?.age ?? ageCurrent.age + 5,
      energy: ageCurrent,
      nextPeriod: ageNext,
    },
    loveDeep,
    moneyDeep,
  };
}
