import { arcanaForNumber, destinyMatrix, reduceToArcanaNumber } from "./destiny-matrix";

const RU_MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function asOfFor(date: Date): { asOfYear: number; asOfMonth: number; asOfDate: string } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return {
    asOfYear: year,
    asOfMonth: month,
    asOfDate: `${year}-${String(month).padStart(2, "0")}-01`,
  };
}

export function matrixYearForecast(birthDate: string, fromDate = new Date()): {
  yearArcana: { number: number; title: string };
  months: Array<{ year: number; month: number; label: string; number: number; title: string; ageTransition?: boolean }>;
  opportunityMonths: number[];
  cautionMonths: number[];
} | null {
  const initial = destinyMatrix(birthDate, asOfFor(fromDate));
  if (!initial) return null;

  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(fromDate.getFullYear(), fromDate.getMonth() + index, 1);
    const prevDate = new Date(fromDate.getFullYear(), fromDate.getMonth() + index - 1, 1);
    const matrix = destinyMatrix(birthDate, asOfFor(date))!;
    const previous = destinyMatrix(birthDate, asOfFor(prevDate));
    const number = reduceToArcanaNumber(matrix.yearArcana.number + date.getMonth() + 1);
    const point = arcanaForNumber(number, matrix.calculationVersion);
    const ageTransition = Boolean(previous && previous.ageCurrent.age !== matrix.ageCurrent.age);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: `${RU_MONTHS[date.getMonth()]} ${date.getFullYear()}`,
      number,
      title: point.arcanaName,
      ...(ageTransition ? { ageTransition: true } : {}),
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
