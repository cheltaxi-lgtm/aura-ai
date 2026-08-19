/**
 * Hand-computed golden vectors for zovus-matrix-22-v2 / matrix-v5.
 * Formulas are from docs/matrix-methodology-v5.md.
 * Values were computed with the published digit-sum reducer, not destinyMatrix().
 *
 * Published checks kept:
 * - 1990-08-15 A15 B8 C19 G6 X12 (matrisa-sudbi.ru)
 * - 31.10.1984 personal 9 / social 9 / spiritual 18 (yookarma.ru)
 * - 12.06.1995 talent chain 6–9–15 (yookarma.ru)
 */
export type MatrixV5GoldenExpected = {
  a: number;
  b: number;
  c: number;
  g: number;
  x: number;
  talents: number;
  talentPrimary: number;
  talentSecondary: number;
  talentTertiary: number;
  love: number;
  money: number;
  sky: number;
  earth: number;
  paternal: number;
  maternal: number;
  personal: number;
  social: number;
  spiritual: number;
  tailTip: number;
  year: number;
  month: number;
  chronological: number;
  periodStart: number;
  periodEnd: number;
  ageEnergy: number;
};

export type MatrixV5GoldenVector = {
  birthDate: string;
  source: string;
  expected: MatrixV5GoldenExpected;
};

const AS_OF = "2026-08-18";

export const MATRIX_V5_GOLDEN_AS_OF = AS_OF;

export const MATRIX_V5_GOLDEN_VECTORS: MatrixV5GoldenVector[] = [
  {
    birthDate: "1990-08-15",
    source: "matrisa-sudbi.ru 15.08.1990 — A15 B8 C19 D6 X12; purpose ≠ center",
    expected: {
      a: 15, b: 8, c: 19, g: 6, x: 12,
      talents: 20, talentPrimary: 8, talentSecondary: 20, talentTertiary: 10,
      love: 9, money: 4, sky: 20, earth: 18,
      paternal: 7, maternal: 9,
      personal: 21, social: 15, spiritual: 9,
      tailTip: 6, year: 6, month: 14,
      chronological: 36, periodStart: 35, periodEnd: 40, ageEnergy: 10,
    },
  },
  {
    birthDate: "1984-10-31",
    source: "yookarma.ru 31.10.1984 — personal 9 social 9 spiritual 18",
    expected: {
      a: 4, b: 10, c: 22, g: 9, x: 9,
      talents: 19, talentPrimary: 10, talentSecondary: 19, talentTertiary: 11,
      love: 13, money: 4, sky: 19, earth: 18,
      paternal: 4, maternal: 5,
      personal: 9, social: 9, spiritual: 18,
      tailTip: 9, year: 6, month: 14,
      chronological: 41, periodStart: 40, periodEnd: 45, ageEnergy: 22,
    },
  },
  {
    birthDate: "1995-06-12",
    source: "yookarma.ru 12.06.1995 — talent chain 6–9–15",
    expected: {
      a: 12, b: 6, c: 6, g: 6, x: 3,
      talents: 9, talentPrimary: 6, talentSecondary: 9, talentTertiary: 15,
      love: 15, money: 9, sky: 9, earth: 9,
      paternal: 12, maternal: 12,
      personal: 3, social: 6, spiritual: 9,
      tailTip: 15, year: 10, month: 18,
      chronological: 31, periodStart: 30, periodEnd: 35, ageEnergy: 12,
    },
  },
  {
    birthDate: "1984-09-07",
    source: "matrica-sudbyy.ru 7.09.1984 core A7 B9 C22 G11 X13; v5 talents=B+X",
    expected: {
      a: 7, b: 9, c: 22, g: 11, x: 13,
      talents: 22, talentPrimary: 9, talentSecondary: 22, talentTertiary: 4,
      love: 20, money: 8, sky: 22, earth: 6,
      paternal: 6, maternal: 4,
      personal: 4, social: 8, spiritual: 12,
      tailTip: 17, year: 8, month: 16,
      chronological: 41, periodStart: 40, periodEnd: 45, ageEnergy: 22,
    },
  },
  {
    birthDate: "2000-01-01",
    source: "boundary year 2000; day/month 1",
    expected: {
      a: 1, b: 1, c: 2, g: 4, x: 8,
      talents: 9, talentPrimary: 1, talentSecondary: 9, talentTertiary: 10,
      love: 9, money: 10, sky: 9, earth: 12,
      paternal: 6, maternal: 3,
      personal: 8, social: 16, spiritual: 6,
      tailTip: 16, year: 12, month: 20,
      chronological: 26, periodStart: 25, periodEnd: 30, ageEnergy: 4,
    },
  },
  {
    birthDate: "1999-12-31",
    source: "day 31→4; month 12; year 28→10",
    expected: {
      a: 4, b: 12, c: 10, g: 8, x: 7,
      talents: 19, talentPrimary: 12, talentSecondary: 19, talentTertiary: 4,
      love: 11, money: 17, sky: 19, earth: 15,
      paternal: 18, maternal: 22,
      personal: 7, social: 14, spiritual: 21,
      tailTip: 5, year: 8, month: 16,
      chronological: 26, periodStart: 25, periodEnd: 30, ageEnergy: 7,
    },
  },
  {
    birthDate: "2000-02-29",
    source: "leap day 29→11",
    expected: {
      a: 11, b: 2, c: 2, g: 15, x: 3,
      talents: 5, talentPrimary: 2, talentSecondary: 5, talentTertiary: 7,
      love: 14, money: 5, sky: 5, earth: 18,
      paternal: 17, maternal: 4,
      personal: 3, social: 15, spiritual: 18,
      tailTip: 6, year: 5, month: 13,
      chronological: 26, periodStart: 25, periodEnd: 30, ageEnergy: 6,
    },
  },
  {
    birthDate: "1992-02-29",
    source: "leap day + year 21",
    expected: {
      a: 11, b: 2, c: 21, g: 7, x: 5,
      talents: 7, talentPrimary: 2, talentSecondary: 7, talentTertiary: 9,
      love: 16, money: 8, sky: 7, earth: 12,
      paternal: 10, maternal: 5,
      personal: 14, social: 10, spiritual: 6,
      tailTip: 19, year: 5, month: 13,
      chronological: 34, periodStart: 30, periodEnd: 35, ageEnergy: 5,
    },
  },
  {
    birthDate: "2011-11-11",
    source: "repeated 11",
    expected: {
      a: 11, b: 11, c: 4, g: 8, x: 7,
      talents: 18, talentPrimary: 11, talentSecondary: 18, talentTertiary: 11,
      love: 18, money: 11, sky: 18, earth: 15,
      paternal: 12, maternal: 15,
      personal: 7, social: 14, spiritual: 21,
      tailTip: 5, year: 5, month: 13,
      chronological: 14, periodStart: 10, periodEnd: 15, ageEnergy: 22,
    },
  },
  {
    birthDate: "2022-02-22",
    source: "day 22 stays; year 6",
    expected: {
      a: 22, b: 2, c: 6, g: 3, x: 6,
      talents: 8, talentPrimary: 2, talentSecondary: 8, talentTertiary: 10,
      love: 10, money: 12, sky: 8, earth: 9,
      paternal: 9, maternal: 8,
      personal: 15, social: 3, spiritual: 18,
      tailTip: 12, year: 7, month: 15,
      chronological: 4, periodStart: 0, periodEnd: 5, ageEnergy: 22,
    },
  },
  {
    birthDate: "1988-08-08",
    source: "repeated 8; Marseille Justice in Matrix dictionary",
    expected: {
      a: 8, b: 8, c: 8, g: 6, x: 3,
      talents: 11, talentPrimary: 8, talentSecondary: 11, talentTertiary: 19,
      love: 11, money: 11, sky: 11, earth: 9,
      paternal: 14, maternal: 16,
      personal: 3, social: 6, spiritual: 9,
      tailTip: 15, year: 8, month: 16,
      chronological: 38, periodStart: 35, periodEnd: 40, ageEnergy: 6,
    },
  },
  {
    birthDate: "1975-03-01",
    source: "day 01; C=22",
    expected: {
      a: 1, b: 3, c: 22, g: 8, x: 7,
      talents: 10, talentPrimary: 3, talentSecondary: 10, talentTertiary: 13,
      love: 8, money: 11, sky: 10, earth: 15,
      paternal: 3, maternal: 7,
      personal: 16, social: 5, spiritual: 21,
      tailTip: 5, year: 14, month: 22,
      chronological: 51, periodStart: 50, periodEnd: 55, ageEnergy: 3,
    },
  },
  {
    birthDate: "1966-06-06",
    source: "age 60 on karmic-adjacent belt; chronological ≠ period label",
    expected: {
      a: 6, b: 6, c: 22, g: 7, x: 5,
      talents: 11, talentPrimary: 6, talentSecondary: 11, talentTertiary: 17,
      love: 11, money: 9, sky: 11, earth: 12,
      paternal: 11, maternal: 10,
      personal: 5, social: 10, spiritual: 15,
      tailTip: 19, year: 22, month: 3,
      chronological: 60, periodStart: 60, periodEnd: 65, ageEnergy: 7,
    },
  },
  {
    birthDate: "1981-01-11",
    source: "day 11; birthday already passed by asOf August",
    expected: {
      a: 11, b: 1, c: 19, g: 4, x: 8,
      talents: 9, talentPrimary: 1, talentSecondary: 9, talentTertiary: 10,
      love: 19, money: 9, sky: 9, earth: 12,
      paternal: 5, maternal: 20,
      personal: 8, social: 7, spiritual: 15,
      tailTip: 16, year: 22, month: 3,
      chronological: 45, periodStart: 45, periodEnd: 50, ageEnergy: 6,
    },
  },
  {
    birthDate: "1993-07-22",
    source: "day 22 + month 7 + C=22",
    expected: {
      a: 22, b: 7, c: 22, g: 6, x: 12,
      talents: 19, talentPrimary: 7, talentSecondary: 19, talentTertiary: 8,
      love: 7, money: 7, sky: 19, earth: 18,
      paternal: 10, maternal: 11,
      personal: 21, social: 6, spiritual: 9,
      tailTip: 6, year: 12, month: 20,
      chronological: 33, periodStart: 30, periodEnd: 35, ageEnergy: 11,
    },
  },
  {
    birthDate: "2001-09-11",
    source: "day 11; year 3",
    expected: {
      a: 11, b: 9, c: 3, g: 5, x: 10,
      talents: 19, talentPrimary: 9, talentSecondary: 19, talentTertiary: 10,
      love: 21, money: 13, sky: 19, earth: 15,
      paternal: 8, maternal: 12,
      personal: 10, social: 20, spiritual: 3,
      tailTip: 20, year: 3, month: 11,
      chronological: 24, periodStart: 20, periodEnd: 25, ageEnergy: 9,
    },
  },
  {
    birthDate: "1987-04-30",
    source: "day 30→3; age 39 before 40 transition",
    expected: {
      a: 3, b: 4, c: 7, g: 14, x: 10,
      talents: 14, talentPrimary: 4, talentSecondary: 14, talentTertiary: 18,
      love: 13, money: 17, sky: 14, earth: 6,
      paternal: 21, maternal: 11,
      personal: 10, social: 20, spiritual: 3,
      tailTip: 20, year: 17, month: 7,
      chronological: 39, periodStart: 35, periodEnd: 40, ageEnergy: 18,
    },
  },
  {
    birthDate: "1979-09-18",
    source: "existing geometry fixture date",
    expected: {
      a: 18, b: 9, c: 8, g: 8, x: 7,
      talents: 16, talentPrimary: 9, talentSecondary: 16, talentTertiary: 7,
      love: 7, money: 15, sky: 16, earth: 15,
      paternal: 16, maternal: 17,
      personal: 7, social: 14, spiritual: 21,
      tailTip: 5, year: 10, month: 18,
      chronological: 46, periodStart: 45, periodEnd: 50, ageEnergy: 6,
    },
  },
  {
    birthDate: "1998-05-29",
    source: "day 29→11",
    expected: {
      a: 11, b: 5, c: 9, g: 7, x: 5,
      talents: 10, talentPrimary: 5, talentSecondary: 10, talentTertiary: 15,
      love: 16, money: 14, sky: 10, earth: 12,
      paternal: 16, maternal: 14,
      personal: 5, social: 10, spiritual: 15,
      tailTip: 19, year: 8, month: 16,
      chronological: 28, periodStart: 25, periodEnd: 30, ageEnergy: 19,
    },
  },
  {
    birthDate: "2003-12-01",
    source: "day 01; month 12",
    expected: {
      a: 1, b: 12, c: 5, g: 18, x: 9,
      talents: 21, talentPrimary: 12, talentSecondary: 21, talentTertiary: 6,
      love: 10, money: 14, sky: 21, earth: 9,
      paternal: 5, maternal: 17,
      personal: 9, social: 9, spiritual: 18,
      tailTip: 9, year: 5, month: 13,
      chronological: 22, periodStart: 20, periodEnd: 25, ageEnergy: 12,
    },
  },
  {
    birthDate: "1970-01-31",
    source: "day 31→4; G=22 stays",
    expected: {
      a: 4, b: 1, c: 17, g: 22, x: 8,
      talents: 9, talentPrimary: 1, talentSecondary: 9, talentTertiary: 10,
      love: 12, money: 7, sky: 9, earth: 3,
      paternal: 12, maternal: 18,
      personal: 8, social: 7, spiritual: 15,
      tailTip: 7, year: 15, month: 5,
      chronological: 56, periodStart: 55, periodEnd: 60, ageEnergy: 7,
    },
  },
  {
    birthDate: "1985-08-15",
    source: "classic public 15.08.1985 under digit-sum (not subtract-22)",
    expected: {
      a: 15, b: 8, c: 5, g: 10, x: 11,
      talents: 19, talentPrimary: 8, talentSecondary: 19, talentTertiary: 9,
      love: 8, money: 16, sky: 19, earth: 21,
      paternal: 15, maternal: 13,
      personal: 11, social: 4, spiritual: 15,
      tailTip: 4, year: 6, month: 14,
      chronological: 41, periodStart: 40, periodEnd: 45, ageEnergy: 5,
    },
  },
  {
    birthDate: "1991-03-08",
    source: "arcana 8 as character; age 35 boundary on asOf",
    expected: {
      a: 8, b: 3, c: 20, g: 4, x: 8,
      talents: 11, talentPrimary: 3, talentSecondary: 11, talentTertiary: 14,
      love: 16, money: 10, sky: 11, earth: 12,
      paternal: 6, maternal: 5,
      personal: 17, social: 7, spiritual: 6,
      tailTip: 16, year: 21, month: 11,
      chronological: 35, periodStart: 35, periodEnd: 40, ageEnergy: 7,
    },
  },
  {
    birthDate: "2010-10-10",
    source: "repeated 10; teen period",
    expected: {
      a: 10, b: 10, c: 3, g: 5, x: 10,
      talents: 20, talentPrimary: 10, talentSecondary: 20, talentTertiary: 3,
      love: 20, money: 13, sky: 20, earth: 15,
      paternal: 8, maternal: 13,
      personal: 10, social: 20, spiritual: 3,
      tailTip: 20, year: 3, month: 11,
      chronological: 15, periodStart: 15, periodEnd: 20, ageEnergy: 3,
    },
  },
];
