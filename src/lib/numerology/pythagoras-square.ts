import { parseBirthDate, reduceToSingle, sumDigits } from "./constants";

export interface PythagorasCellInterpretation {
  count: number;
  summary: string;
}

export interface PythagorasLineInterpretation {
  label: string;
  strength: number;
  summary: string;
}

export interface PythagorasSquareResult {
  cells: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, number>;
  interpretation: {
    character: PythagorasCellInterpretation;
    energy: PythagorasCellInterpretation;
    health: PythagorasCellInterpretation;
    logic: PythagorasCellInterpretation;
    labor: PythagorasCellInterpretation;
    luck: PythagorasCellInterpretation;
    duty: PythagorasCellInterpretation;
    talent: PythagorasCellInterpretation;
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
  3: (c) =>
    c === 0
      ? "Слабое здоровье/самочувствие — берегите ресурс."
      : c === 1
        ? "Средний уровень, важны привычки и профилактика."
        : c >= 2
          ? "Крепкая конституция, быстрое восстановление."
          : "",
  4: (c) =>
    c === 0
      ? "Логика развивается через практику и обучение."
      : c === 1
        ? "Практичный ум, системное мышление."
        : c >= 2
          ? "Сильная аналитика, точные решения."
          : "",
  5: (c) =>
    c === 0
      ? "Труд даётся через дисциплину, избегайте хаоса."
      : c === 1
        ? "Работоспособность есть при ясной цели."
        : c >= 2
          ? "Высокая трудоспособность, мастерство через практику."
          : "",
  6: (c) =>
    c === 0
      ? "Удача приходит через терпение и подготовку."
      : c === 1
        ? "Умеренная удача, важны благоприятные решения."
        : c >= 2
          ? "Сильная интуиция на возможности, везение в делах."
          : "",
  7: (c) =>
    c === 0
      ? "Долг и ответственность — зона роста."
      : c === 1
        ? "Чувство долга присутствует, важна честность."
        : c >= 2
          ? "Сильная ответственность, надёжность для окружения."
          : "",
  8: (c) =>
    c === 0
      ? "Талант проявится через практику и наставника."
      : c === 1
        ? "Есть дар, нужна регулярная реализация."
        : c >= 2
          ? "Яркий талант, творческая или профессиональная одарённость."
          : "",
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

  const firstWork = [...dateDigits].reduce((s, d) => s + parseInt(d, 10), 0);
  addDigitsToCells(cells, firstWork);

  let secondWork: number;
  if (parsed.day >= 10) {
    secondWork = firstWork - 2 * Math.floor(parsed.day / 10);
  } else {
    secondWork = firstWork - 2 * parsed.day;
  }
  if (secondWork > 0) addDigitsToCells(cells, secondWork);

  const reducedSecond = reduceToSingle(secondWork, false);
  if (reducedSecond > 0 && reducedSecond !== secondWork) {
    addDigitsToCells(cells, reducedSecond);
  }

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
    cells,
    interpretation: {
      character: cellInterp(1),
      energy: cellInterp(2),
      health: cellInterp(3),
      logic: cellInterp(4),
      labor: cellInterp(5),
      luck: cellInterp(6),
      duty: cellInterp(7),
      talent: cellInterp(8),
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
