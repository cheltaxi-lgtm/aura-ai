import type { PythagorasSquareResult } from "./pythagoras-square";
import { pythagorasSquare } from "./pythagoras-square";
import { destinyMatrix, type DestinyMatrixResult } from "./destiny-matrix";
import { drawNumerologSessionSpread } from "./session-draw";
import {
  getNumerologTool,
  numerologToolPositions,
  type NumerologToolId,
  type NumerologToolParams,
} from "./tools";
import { personalYearForecast } from "./forecast";
import { parseBirthDate } from "./constants";

export interface NumerologSessionPosition {
  label: string;
  value: string;
  detail?: string;
}

export interface NumerologSessionResult {
  toolId: NumerologToolId;
  title: string;
  subtitle: string;
  positions: NumerologSessionPosition[];
  /** Card names for chat/session persistence (values only). */
  cardNames: string[];
  pythagorasSquare?: PythagorasSquareResult;
  destinyMatrix?: DestinyMatrixResult;
}

function formatMonthDay(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

function enrichPositions(
  toolId: NumerologToolId,
  symbols: ReturnType<typeof drawNumerologSessionSpread>,
  birthDate?: string | null
): NumerologSessionPosition[] {
  const tool = getNumerologTool(toolId);
  const fromYear = new Date().getFullYear();
  const labels = numerologToolPositions(toolId, { fromYear });

  if (toolId === "forecast_9y" && birthDate && parseBirthDate(birthDate)) {
    const forecast = personalYearForecast(birthDate, fromYear, 9);
    return symbols.map((sym, i) => {
      const entry = forecast[i];
      return {
        label: entry ? `${entry.year}` : labels[i] ?? `Год ${i + 1}`,
        value: sym.name,
        detail: entry ? `Личный год ${entry.number}` : sym.meaning,
      };
    });
  }

  if (toolId === "favorable_dates") {
    return symbols.map((sym, i) => ({
      label: labels[i] ?? `Позиция ${i + 1}`,
      value: sym.name,
      detail:
        i === 0
          ? "Благоприятный день месяца"
          : i === 1
            ? "Окно возможностей"
            : "День осторожности",
    }));
  }

  if (toolId === "compatibility") {
    return symbols.map((sym, i) => ({
      label: labels[i] ?? (i === 0 ? "Вы" : "Партнёр"),
      value: sym.name,
      detail: i === 0 ? "Число жизненного пути" : "Число жизненного пути партнёра",
    }));
  }

  return symbols.map((sym, i) => ({
    label: labels[i] ?? `Позиция ${i + 1}`,
    value: sym.name,
    detail: sym.meaning || undefined,
  }));
}

export function buildNumerologSessionResult(input: {
  toolId: NumerologToolId;
  birthDate?: string | null;
  fullName?: string | null;
  params?: NumerologToolParams;
}): NumerologSessionResult | null {
  const tool = getNumerologTool(input.toolId);

  if (tool.drawCount === 0) {
    if (input.toolId === "pythagoras") {
      const parsed = parseBirthDate(input.birthDate ?? "");
      if (!parsed) return null;
      const square = pythagorasSquare(input.birthDate!);
      if (!square) return null;
      return {
        toolId: input.toolId,
        title: tool.label,
        subtitle: tool.tagline ?? tool.description ?? "Психоматрица по дате рождения",
        positions: [],
        cardNames: [],
        pythagorasSquare: square,
      };
    }
    if (input.toolId === "destiny_matrix") {
      const parsed = parseBirthDate(input.birthDate ?? "");
      if (!parsed) return null;
      const matrix = destinyMatrix(input.birthDate!);
      if (!matrix) return null;
      const points: { label: string; value: string; detail: string; number: number }[] = [
        {
          label: "Тело и характер",
          value: matrix.body.arcanaName,
          detail: matrix.body.arcanaMeaning,
          number: matrix.body.number,
        },
        {
          label: "Энергия",
          value: matrix.energy.arcanaName,
          detail: matrix.energy.arcanaMeaning,
          number: matrix.energy.number,
        },
        {
          label: "Род и корни",
          value: matrix.roots.arcanaName,
          detail: matrix.roots.arcanaMeaning,
          number: matrix.roots.number,
        },
        {
          label: "Предназначение",
          value: matrix.purpose.arcanaName,
          detail: matrix.purpose.arcanaMeaning,
          number: matrix.purpose.number,
        },
        {
          label: "Отношения",
          value: matrix.relationships.arcanaName,
          detail: matrix.relationships.arcanaMeaning,
          number: matrix.relationships.number,
        },
        {
          label: "Деньги",
          value: matrix.money.arcanaName,
          detail: matrix.money.arcanaMeaning,
          number: matrix.money.number,
        },
        {
          label: "Карма",
          value: matrix.karma.arcanaName,
          detail: matrix.karma.arcanaMeaning,
          number: matrix.karma.number,
        },
      ];
      return {
        toolId: input.toolId,
        title: tool.label,
        subtitle: tool.tagline ?? tool.description ?? "Матрица судьбы по дате рождения",
        positions: points,
        cardNames: points.map((p) => `${p.number} — ${p.value}`),
        destinyMatrix: matrix,
      };
    }
    return null;
  }

  const symbols = drawNumerologSessionSpread(input.toolId, {
    birthDate: input.birthDate,
    fullName: input.fullName,
    params: input.params,
  });

  if (symbols.length < tool.drawCount) return null;

  const positions = enrichPositions(input.toolId, symbols, input.birthDate);

  return {
    toolId: input.toolId,
    title: tool.label,
    subtitle: tool.tagline ?? tool.description ?? "Расчёт по вашим данным",
    positions,
    cardNames: positions.map((p) => p.value),
  };
}
