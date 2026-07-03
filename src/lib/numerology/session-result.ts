import type { PythagorasSquareResult } from "./pythagoras-square";
import { pythagorasSquare } from "./pythagoras-square";
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
