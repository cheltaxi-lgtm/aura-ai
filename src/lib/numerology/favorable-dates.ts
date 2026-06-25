import { personalDay, type NumerologyResult } from "./calculator";
import { parseBirthDate } from "./constants";

export interface FavorableDatesResult {
  favorable: number[];
  neutral: number[];
  caution: number[];
}

/** Благоприятные / нейтральные / осторожные дни месяца по личному дню. */
export function favorableDates(
  birthDate: string,
  month?: number,
  year?: number
): FavorableDatesResult | null {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;

  const refYear = year ?? new Date().getFullYear();
  const refMonth = month ?? new Date().getMonth() + 1;
  const daysInMonth = new Date(refYear, refMonth, 0).getDate();

  const favorable: number[] = [];
  const neutral: number[] = [];
  const caution: number[] = [];

  const personalYearNum = (() => {
    const py = parsed.day + parsed.month + refYear;
    let n = py;
    while (n > 9 && n !== 11 && n !== 22 && n !== 33) {
      n = String(n)
        .split("")
        .reduce((s, d) => s + parseInt(d, 10), 0);
    }
    return n;
  })();

  for (let day = 1; day <= daysInMonth; day++) {
    const pd: NumerologyResult = personalDay(birthDate, new Date(refYear, refMonth - 1, day));
    const n = pd.number;
    if (n <= 0) {
      neutral.push(day);
      continue;
    }

    const harmony =
      n === personalYearNum ||
      n === 1 ||
      n === 6 ||
      n === 9 ||
      (personalYearNum === 5 && (n === 3 || n === 5));

    const tension = n === 4 || n === 7 || n === 8 || n === 13 || n === 16;

    if (harmony && !tension) favorable.push(day);
    else if (tension) caution.push(day);
    else neutral.push(day);
  }

  return { favorable, neutral, caution };
}
