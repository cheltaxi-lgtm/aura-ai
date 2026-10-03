import { parseBirthDate, sumDigits } from "./constants";

export interface PythagorasCellInterpretation {
  count: number;
  summary: string;
}

export interface PythagorasLineInterpretation {
  label: string;
  strength: number;
  summary: string;
}

export const PYTHAGORAS_METHOD_VERSION = "alexandrov-four-working-numbers-v2" as const;

export interface PythagorasSquareResult {
  /** Absent only on persisted legacy results; never rewrite their digits. */
  methodVersion?: typeof PYTHAGORAS_METHOD_VERSION;
  workingNumbers?: [number, number, number, number];
  /** A missing historical UI snapshot may be rebuilt, but must be labelled as such. */
  reconstructedFromCurrentProfile?: boolean;
  birthDate?: string;
  cells: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, number>;
  interpretation: {
    character: PythagorasCellInterpretation;
    energy: PythagorasCellInterpretation;
    interest: PythagorasCellInterpretation;
    health: PythagorasCellInterpretation;
    logic: PythagorasCellInterpretation;
    labor: PythagorasCellInterpretation;
    luck: PythagorasCellInterpretation;
    duty: PythagorasCellInterpretation;
    memory: PythagorasCellInterpretation;
  };
  lines: {
    rows: PythagorasLineInterpretation[];
    cols: PythagorasLineInterpretation[];
    diagonals: PythagorasLineInterpretation[];
  };
}

const CELL_TEXT: Record<number, (count: number) => string> = {
  1: (c) =>
    c === 0
      ? "Слабая воля, нужна опора и структура."
      : c === 1
        ? "Характер формируется, воля растёт через вызовы."
        : c === 2
          ? "Устойчивый характер, умение отстаивать границы."
          : c >= 3
            ? "Сильная воля, лидерские качества, иногда жёсткость."
            : "",
  2: (c) =>
    c === 0
      ? "Энергия нестабильна — важны режим и восстановление."
      : c === 1
        ? "Базовая жизненная энергия, нужен баланс нагрузки."
        : c >= 2
          ? "Хороший запас сил, активность и выносливость."
          : "",
  3: (c) => c === 0 ? "Интересы раскрываются через знакомство с разными занятиями." : c === 1 ? "Есть любознательность и интерес к новому." : "Выраженный интерес к знаниям и исследованию.",
  4: (c) => c === 0 ? "В символике метода это тема заботы о себе; количество цифр не оценивает здоровье." : "В символике метода это телесный ресурс; цифры не заменяют медицинскую оценку.",
  5: (c) => c === 0 ? "Логика развивается через практику и обучение." : c === 1 ? "Практичный ум, системное мышление." : "Выраженная склонность к анализу.",
  6: (c) => c === 0 ? "Труд опирается на дисциплину и ясный план." : c === 1 ? "Работоспособность проявляется при ясной цели." : "Мастерство раскрывается через регулярную практику.",
  7: (c) => c === 0 ? "Возможности легче замечать благодаря подготовке." : c === 1 ? "В символике метода — внимание к благоприятным возможностям." : "Тема возможностей выражена; результат зависит и от действий.",
  8: (c) => c === 0 ? "Ответственность развивается через договорённости." : c === 1 ? "Чувство долга и надёжность." : "Выраженное внимание к долгу и ответственности.",
  9: (c) =>
    c === 0
      ? "Память и глубина — через записи и повторение."
      : c === 1
        ? "Хорошая память на важное, развивается с опытом."
        : c >= 2
          ? "Сильная память, мудрость накопленного опыта."
          : "",
};

function emptyCells(): Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
}

function addDigitsToCells(cells: Record<number, number>, value: number) {
  for (const ch of String(Math.abs(value))) {
    const d = parseInt(ch, 10);
    if (d >= 1 && d <= 9) cells[d] = (cells[d] ?? 0) + 1;
  }
}

function lineStrength(cells: Record<number, number>, keys: number[]): number {
  return keys.reduce((s, k) => s + (cells[k] ?? 0), 0);
}

function lineSummary(label: string, strength: number): string {
  if (strength === 0) return `${label}: линия слабая — зона развития.`;
  if (strength <= 2) return `${label}: умеренная сила, стабильный потенциал.`;
  if (strength <= 4) return `${label}: сильная линия, заметный ресурс.`;
  return `${label}: очень сильная линия — ключевая опора личности.`;
}

/** Квадрат Пифагора / психоматрица по дате рождения (классический РФ-метод). */
export function pythagorasSquare(birthDate: string): PythagorasSquareResult | null {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return null;

  const cells = emptyCells();
  const dateDigits = `${String(parsed.day).padStart(2, "0")}${String(parsed.month).padStart(2, "0")}${parsed.year}`;

  for (const ch of dateDigits) {
    const d = parseInt(ch, 10);
    if (d >= 1 && d <= 9) cells[d as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9]++;
  }

  // Declared four-number method for the full supported 1900–2100 range:
  // no post-2000 +19 variant; zeros add no cell, minus signs add no digit.
  // Each working number contributes once, even if it repeats or is single-digit.
  const firstWork = sumDigits(Number(dateDigits));
  const secondWork = sumDigits(firstWork);
  const firstDayDigit = Number(String(parsed.day)[0]);
  const thirdWork = firstWork - 2 * firstDayDigit;
  const fourthWork = sumDigits(thirdWork);
  const workingNumbers: [number, number, number, number] = [firstWork, secondWork, thirdWork, fourthWork];
  for (const number of workingNumbers) addDigitsToCells(cells, number);

  const cellInterp = (n: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): PythagorasCellInterpretation => ({
    count: cells[n],
    summary: CELL_TEXT[n](cells[n]),
  });

  const rows: PythagorasLineInterpretation[] = [
    { label: "Целеустремлённость (1-4-7)", keys: [1, 4, 7] },
    { label: "Семья и быт (2-5-8)", keys: [2, 5, 8] },
    { label: "Стабильность (3-6-9)", keys: [3, 6, 9] },
  ].map(({ label, keys }) => {
    const strength = lineStrength(cells, keys);
    return { label, strength, summary: lineSummary(label, strength) };
  });

  const cols: PythagorasLineInterpretation[] = [
    { label: "Самооценка (1-2-3)", keys: [1, 2, 3] },
    { label: "Материальное (4-5-6)", keys: [4, 5, 6] },
    { label: "Талант (7-8-9)", keys: [7, 8, 9] },
  ].map(({ label, keys }) => {
    const strength = lineStrength(cells, keys);
    return { label, strength, summary: lineSummary(label, strength) };
  });

  const diagonals: PythagorasLineInterpretation[] = [
    { label: "Духовная (1-5-9)", keys: [1, 5, 9] },
    { label: "Темперамент (3-5-7)", keys: [3, 5, 7] },
  ].map(({ label, keys }) => {
    const strength = lineStrength(cells, keys);
    return { label, strength, summary: lineSummary(label, strength) };
  });

  return {
    methodVersion: PYTHAGORAS_METHOD_VERSION,
    workingNumbers,
    birthDate: `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`,
    cells,
    interpretation: {
      character: cellInterp(1),
      energy: cellInterp(2),
      interest: cellInterp(3),
      health: cellInterp(4),
      logic: cellInterp(5),
      labor: cellInterp(6),
      luck: cellInterp(7),
      duty: cellInterp(8),
      memory: cellInterp(9),
    },
    lines: { rows, cols, diagonals },
  };
}

export function formatPythagorasSquareAscii(square: PythagorasSquareResult): string {
  const c = square.cells;
  const cell = (n: number) => String(n).repeat(c[n as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9] || 0) || "—";
  return [
    "Квадрат Пифагора (3×3):",
    `${cell(1)} | ${cell(4)} | ${cell(7)}`,
    `${cell(2)} | ${cell(5)} | ${cell(8)}`,
    `${cell(3)} | ${cell(6)} | ${cell(9)}`,
    "(число в ячейке = количество цифр; «—» = пусто)",
  ].join("\n");
}
