import { addMatrixCalendarMonths, matrixCalendarYmd } from "./matrix-calendar";
import { arcanaForNumber, destinyMatrix, reduceToArcanaNumber } from "./destiny-matrix";

const RU_MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function asOfFor(year: number, month: number, day = 1): { asOfYear: number; asOfMonth: number; asOfDate: string } {
  return {
    asOfYear: year,
    asOfMonth: month,
    asOfDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export function matrixYearForecast(birthDate: string, fromDate = new Date()): {
  yearArcana: { number: number; title: string };
  months: Array<{
    year: number;
    month: number;
    label: string;
    number: number;
    title: string;
    ageTransition?: boolean;
    periodFrom?: number;
    periodTo?: number;
    chronological?: number;
  }>;
  opportunityMonths: number[];
  cautionMonths: number[];
} | null {
  const start = matrixCalendarYmd(fromDate);
  const initial = destinyMatrix(birthDate, asOfFor(start.year, start.month));
  if (!initial) return null;

  const months = Array.from({ length: 12 }, (_, index) => {
    const cur = addMatrixCalendarMonths(start.year, start.month, index);
    const prev = addMatrixCalendarMonths(start.year, start.month, index - 1);
    const matrix = destinyMatrix(birthDate, asOfFor(cur.year, cur.month))!;
    const previous = destinyMatrix(birthDate, asOfFor(prev.year, prev.month, new Date(Date.UTC(prev.year, prev.month, 0)).getUTCDate()));
    const monthEnd = destinyMatrix(birthDate, asOfFor(cur.year, cur.month, new Date(Date.UTC(cur.year, cur.month, 0)).getUTCDate()))!;
    const number = reduceToArcanaNumber(matrix.yearArcana.number + cur.month);
    const point = arcanaForNumber(number, matrix.calculationVersion);
    const ageTransition = Boolean(previous && previous.ageCurrent.age !== monthEnd.ageCurrent.age);
    return {
      year: cur.year,
      month: cur.month,
      label: `${RU_MONTHS[cur.month - 1]} ${cur.year}`,
      number,
      title: point.arcanaName,
      ...(ageTransition
        ? {
            ageTransition: true,
            periodFrom: previous!.ageCurrent.age,
            periodTo: monthEnd.ageCurrent.age,
            chronological: monthEnd.chronologicalAge,
          }
        : {}),
    };
  });

  const opportunityMonths = months.flatMap((month, index) =>
    [3, 6, 10, 17, 19].includes(month.number) ? [index] : []
  );
  const cautionMonths = months.flatMap((month, index) =>
    [12, 13, 15, 16, 18].includes(month.number) ? [index] : []
  );

  return {
    yearArcana: { number: initial.yearArcana.number, title: initial.yearArcana.arcanaName },
    months,
    opportunityMonths,
    cautionMonths,
  };
}
