import { arcanaForNumber, destinyMatrix, reduceToArcanaNumber } from "./destiny-matrix";

const RU_MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export function matrixYearForecast(birthDate: string, fromDate = new Date()): {
  yearArcana: { number: number; title: string };
  months: Array<{ year: number; month: number; label: string; number: number; title: string; ageTransition?: boolean }>;
  opportunityMonths: number[];
  cautionMonths: number[];
} | null {
  const initial = destinyMatrix(birthDate, {
    asOfYear: fromDate.getFullYear(),
    asOfMonth: fromDate.getMonth() + 1,
    asOfDate: `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`,
  });
  if (!initial) return null;

  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(fromDate.getFullYear(), fromDate.getMonth() + index, 1);
    const matrix = destinyMatrix(birthDate, {
      asOfYear: date.getFullYear(),
      asOfMonth: date.getMonth() + 1,
      asOfDate: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`,
    })!;
    // Same month formula as destinyMatrix: reduce(year arcana + calendar month).
    const number = reduceToArcanaNumber(matrix.yearArcana.number + date.getMonth() + 1);
    const point = arcanaForNumber(number);
    const ageTransition = matrix.ageNext != null && matrix.ageNext.age === matrix.ageCurrent.age;
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
