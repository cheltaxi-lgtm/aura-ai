import {
  birthdayNumber,
  destinyNumber,
  karmicDebts,
  karmicLessons,
  lifePathNumber,
  maturityNumber,
  personalDay,
  personalMonth,
  personalYear,
  personalityNumber,
  soulNumber,
  type NumerologyResult,
} from "./calculator";
import { compatibility, type CompatibilityResult } from "./compatibility";
import { favorableDates, type FavorableDatesResult } from "./favorable-dates";
import { personalYearForecast, type PersonalYearForecastEntry } from "./forecast";
import type { NumerologySystem } from "./constants";
import {
  formatPythagorasSquareAscii,
  pythagorasSquare,
  type PythagorasSquareResult,
} from "./pythagoras-square";

export interface FullNumerologyProfile {
  system: NumerologySystem;
  birthDate: string;
  fullName: string;
  hasValidBirthDate: boolean;
  hasValidName: boolean;
  lifePath: NumerologyResult;
  destiny: NumerologyResult;
  soul: NumerologyResult;
  personality: NumerologyResult;
  birthday: NumerologyResult;
  maturity: NumerologyResult;
  personalYear: NumerologyResult;
  personalMonth: NumerologyResult;
  personalDay: NumerologyResult;
  karmicDebts: number[];
  karmicLessons: number[];
  pythagorasSquare: PythagorasSquareResult | null;
  pythagorasSquareAscii: string;
  forecast9Years: PersonalYearForecastEntry[];
  favorableDatesThisMonth: FavorableDatesResult | null;
}

export function fullProfile(
  birthDate: string,
  fullName: string,
  system: NumerologySystem = "pythagorean"
): FullNumerologyProfile {
  const hasValidBirthDate = Boolean(birthDate?.trim());
  const hasValidName = Boolean(fullName?.trim());

  const lp = lifePathNumber(birthDate);
  const dest = destinyNumber(fullName, system);
  const soul = soulNumber(fullName, system);
  const pers = personalityNumber(fullName, system);
  const bday = birthdayNumber(birthDate);
  const mat = maturityNumber(lp, dest);
  const py = personalYear(birthDate);
  const pm = personalMonth(birthDate);
  const pd = personalDay(birthDate);
  const debts = hasValidBirthDate || hasValidName ? karmicDebts(birthDate, fullName) : [];
  const lessons = hasValidName ? karmicLessons(fullName, system) : [];
  const square = hasValidBirthDate ? pythagorasSquare(birthDate) : null;
  const forecast = hasValidBirthDate ? personalYearForecast(birthDate) : [];
  const favDates = hasValidBirthDate ? favorableDates(birthDate) : null;

  return {
    system,
    birthDate: birthDate?.trim() ?? "",
    fullName: fullName?.trim() ?? "",
    hasValidBirthDate,
    hasValidName,
    lifePath: lp,
    destiny: dest,
    soul: soul,
    personality: pers,
    birthday: bday,
    maturity: mat,
    personalYear: py,
    personalMonth: pm,
    personalDay: pd,
    karmicDebts: debts,
    karmicLessons: lessons,
    pythagorasSquare: square,
    pythagorasSquareAscii: square ? formatPythagorasSquareAscii(square) : "",
    forecast9Years: forecast,
    favorableDatesThisMonth: favDates,
  };
}

export type { CompatibilityResult };
export { compatibility };
