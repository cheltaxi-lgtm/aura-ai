import { parseBirthDate } from "./constants";
import type { NumerologyTopic } from "./topic-handlers";
import { PRICING } from "@/lib/config/pricing";
import { buildSessionSpreadCards } from "@/lib/intention-draw";
import type { DeckSystem, SpreadSymbol } from "@/lib/decks/types";

export type NumerologToolId =
  | "period_today"
  | "period_week"
  | "period_month"
  | "pythagoras"
  | "personal_year"
  | "forecast_9y"
  | "favorable_dates"
  | "karma"
  | "chaldean"
  | "compatibility"
  | "object_number"
  | "spread_three_numbers";

export type NumerologToolForm = "compat" | "phone";

export type NumerologToolParams = {
  partnerName?: string;
  partnerDate?: string;
  objectValue?: string;
};

export type NumerologToolGroup = "period" | "session" | "form";

export interface NumerologToolDef {
  id: NumerologToolId;
  emoji: string;
  label: string;
  topic: NumerologyTopic | "spread_opening";
  group: NumerologToolGroup;
  /** Runes for a full session spread reading. Period tools use QUESTION via chat. */
  cost: number;
  drawCount: number;
  positions: string[];
  needsForm?: NumerologToolForm;
  description?: string;
  buildMessage: (params?: NumerologToolParams) => string;
}

const QUESTION_COST = PRICING.QUESTION;
const SESSION_COST = PRICING.NUMEROLOGY_SESSION;

export const NUMEROLOG_TOOLS: NumerologToolDef[] = [
  {
    id: "period_today",
    emoji: "☀️",
    label: "Сегодня",
    topic: "personal_cycle",
    group: "period",
    cost: QUESTION_COST,
    drawCount: 0,
    positions: [],
    buildMessage: () => "Расклад по цифрам на сегодня",
  },
  {
    id: "period_week",
    emoji: "📆",
    label: "Неделя",
    topic: "personal_cycle",
    group: "period",
    cost: QUESTION_COST,
    drawCount: 0,
    positions: [],
    buildMessage: () => "Расклад по цифрам на неделю",
  },
  {
    id: "period_month",
    emoji: "🗓️",
    label: "Месяц",
    topic: "personal_cycle",
    group: "period",
    cost: QUESTION_COST,
    drawCount: 0,
    positions: [],
    buildMessage: () => "Расклад по цифрам на месяц",
  },
  {
    id: "spread_three_numbers",
    emoji: "✨",
    label: "Три числа",
    topic: "spread_opening",
    group: "session",
    cost: SESSION_COST,
    drawCount: 3,
    positions: ["Твоё число пути", "Энергия периода", "Совет чисел"],
    description: "Классический открывающий расклад",
    buildMessage: () => "draw_three_numbers",
  },
  {
    id: "pythagoras",
    emoji: "🔢",
    label: "Квадрат Пифагора",
    topic: "pythagoras_square",
    group: "session",
    cost: SESSION_COST,
    drawCount: 9,
    positions: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    description: "Девять ячеек психоматрицы",
    buildMessage: () => "Разбери мой квадрат Пифагора",
  },
  {
    id: "personal_year",
    emoji: "📅",
    label: "Личный год",
    topic: "personal_cycle",
    group: "session",
    cost: SESSION_COST,
    drawCount: 1,
    positions: ["Личный год"],
    description: "Энергия текущего года",
    buildMessage: () => "Что меня ждёт в этом году?",
  },
  {
    id: "forecast_9y",
    emoji: "🔮",
    label: "Прогноз 9 лет",
    topic: "forecast_timeline",
    group: "session",
    cost: SESSION_COST,
    drawCount: 9,
    positions: ["Год 1", "Год 2", "Год 3", "Год 4", "Год 5", "Год 6", "Год 7", "Год 8", "Год 9"],
    description: "Циклы на девять лет вперёд",
    buildMessage: () => "Покажи мой прогноз на 9 лет",
  },
  {
    id: "favorable_dates",
    emoji: "🍀",
    label: "Удачные даты",
    topic: "favorable_dates",
    group: "session",
    cost: SESSION_COST,
    drawCount: 3,
    positions: ["Лучший день", "Окно возможности", "День осторожности"],
    description: "Благоприятные даты для решений",
    buildMessage: () => "Какие благоприятные даты для меня?",
  },
  {
    id: "karma",
    emoji: "⚖️",
    label: "Карма",
    topic: "karma",
    group: "session",
    cost: SESSION_COST,
    drawCount: 3,
    positions: ["Кармический урок", "Долг", "Путь исцеления"],
    description: "Кармические уроки и долги",
    buildMessage: () => "Разбери мою карму",
  },
  {
    id: "chaldean",
    emoji: "📜",
    label: "Халдейская",
    topic: "chaldean",
    group: "session",
    cost: SESSION_COST,
    drawCount: 3,
    positions: ["Число души", "Число личности", "Число судьбы"],
    description: "Числа имени по халдейской системе",
    buildMessage: () => "Посчитай мои числа имени по халдейской системе",
  },
  {
    id: "compatibility",
    emoji: "💞",
    label: "Совместимость",
    topic: "compatibility",
    group: "form",
    cost: SESSION_COST,
    drawCount: 2,
    positions: ["Ваш код", "Код партнёра"],
    needsForm: "compat",
    description: "Совместимость с партнёром",
    buildMessage: (params) => {
      const date = params?.partnerDate?.trim() ?? "";
      const name = params?.partnerName?.trim() || "партнёр";
      return `Совместимость с ${name}, дата рождения ${date}`;
    },
  },
  {
    id: "object_number",
    emoji: "🔢",
    label: "Число объекта",
    topic: "object_number",
    group: "form",
    cost: SESSION_COST,
    drawCount: 1,
    positions: ["Число объекта"],
    needsForm: "phone",
    description: "Телефон, авто, адрес или бренд",
    buildMessage: (params) => {
      const value = params?.objectValue?.trim() ?? "";
      return `Рассчитай число объекта «${value}»`;
    },
  },
];

const TOOL_MAP = new Map(NUMEROLOG_TOOLS.map((tool) => [tool.id, tool]));

export function getNumerologTool(id: NumerologToolId): NumerologToolDef {
  const tool = TOOL_MAP.get(id);
  if (!tool) throw new Error(`Unknown numerolog tool: ${id}`);
  return tool;
}

export function isNumerologToolId(value: string): value is NumerologToolId {
  return TOOL_MAP.has(value as NumerologToolId);
}

export function buildNumerologToolMessage(
  toolId: NumerologToolId,
  params?: NumerologToolParams
): string {
  return getNumerologTool(toolId).buildMessage(params);
}

export function numerologToolCost(toolId: NumerologToolId): number {
  return getNumerologTool(toolId).cost;
}

export function numerologToolDrawCount(toolId: NumerologToolId): number {
  return getNumerologTool(toolId).drawCount;
}

export function numerologToolPositions(toolId: NumerologToolId): string[] {
  return getNumerologTool(toolId).positions;
}

export function validateNumerologToolParams(
  toolId: NumerologToolId,
  params?: NumerologToolParams
): string | null {
  const tool = getNumerologTool(toolId);
  if (tool.needsForm === "compat") {
    const date = params?.partnerDate?.trim() ?? "";
    if (!date) return "Укажите дату рождения партнёра.";
    if (!parseBirthDate(date)) {
      return "Некорректная дата. Формат: ДД.ММ.ГГГГ (например, 17.03.1993).";
    }
  }
  if (tool.needsForm === "phone") {
    const value = params?.objectValue?.trim() ?? "";
    if (!value) return "Укажите номер, название или адрес.";
  }
  return null;
}

export const NUMEROLOG_PERIOD_TOOLS = NUMEROLOG_TOOLS.filter((t) => t.group === "period");
export const NUMEROLOG_SESSION_TOOLS = NUMEROLOG_TOOLS.filter((t) => t.group !== "period");

export function isNumerologSessionToolId(value: string): value is NumerologToolId {
  return isNumerologToolId(value) && getNumerologTool(value).group !== "period";
}

export const DEFAULT_NUMEROLOG_SESSION_TOOL: NumerologToolId = "spread_three_numbers";

export function numerologSpreadComplete(
  cards: string[] | null | undefined,
  toolId?: NumerologToolId | null
): boolean {
  const id = toolId ?? DEFAULT_NUMEROLOG_SESSION_TOOL;
  if (!isNumerologSessionToolId(id)) return false;
  return (cards?.length ?? 0) >= numerologToolDrawCount(id);
}

/** Session tools that require a valid birth date in the user profile. */
export const NUMEROLOG_BIRTH_DATE_TOOLS = new Set<NumerologToolId>([
  "spread_three_numbers",
  "pythagoras",
  "personal_year",
  "forecast_9y",
  "karma",
  "chaldean",
]);

export function numerologSessionNeedsBirthDate(toolId: NumerologToolId): boolean {
  return NUMEROLOG_BIRTH_DATE_TOOLS.has(toolId);
}

export function validateNumerologSessionReady(
  toolId: NumerologToolId,
  params?: NumerologToolParams,
  birthDate?: string | null
): string | null {
  const paramError = validateNumerologToolParams(toolId, params);
  if (paramError) return paramError;
  if (numerologSessionNeedsBirthDate(toolId) && !parseBirthDate(birthDate ?? "")) {
    return "Укажите дату рождения в профиле — без неё этот расчёт недоступен.";
  }
  return null;
}

/** Build spread symbols for a numerolog session tool (respects per-tool drawCount). */
export function buildNumerologSpreadCards(
  characterKey: string,
  cardNames: string[],
  toolId: NumerologToolId,
  options?: {
    previewCards?: { name: string; meaning?: string }[];
    deckSystem?: DeckSystem;
  }
): { spreadCards: SpreadSymbol[]; system: DeckSystem } {
  const drawCount = numerologToolDrawCount(toolId);
  return buildSessionSpreadCards(characterKey, cardNames, {
    ...options,
    cardCount: drawCount,
    positionLabels: numerologToolPositions(toolId),
  });
}
