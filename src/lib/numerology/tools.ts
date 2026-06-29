import { parseBirthDate } from "./constants";
import type { NumerologyTopic } from "./topic-handlers";
import { PRICING } from "@/lib/config/pricing";

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

export type NumerologToolGroup = "period" | "profile" | "form" | "session";

export interface NumerologToolDef {
  id: NumerologToolId;
  emoji: string;
  label: string;
  topic: NumerologyTopic | "spread_opening";
  group: NumerologToolGroup;
  cost: number;
  needsForm?: NumerologToolForm;
  description?: string;
  buildMessage: (params?: NumerologToolParams) => string;
}

const QUESTION_COST = PRICING.QUESTION;

export const NUMEROLOG_TOOLS: NumerologToolDef[] = [
  {
    id: "period_today",
    emoji: "☀️",
    label: "Сегодня",
    topic: "personal_cycle",
    group: "period",
    cost: QUESTION_COST,
    description: "Энергия дня и личное число",
    buildMessage: () => "Расклад по цифрам на сегодня",
  },
  {
    id: "period_week",
    emoji: "📆",
    label: "Неделя",
    topic: "personal_cycle",
    group: "period",
    cost: QUESTION_COST,
    description: "Цикл недели и ключевые дни",
    buildMessage: () => "Расклад по цифрам на неделю",
  },
  {
    id: "period_month",
    emoji: "🗓️",
    label: "Месяц",
    topic: "personal_cycle",
    group: "period",
    cost: QUESTION_COST,
    description: "Личный месяц и фокус периода",
    buildMessage: () => "Расклад по цифрам на месяц",
  },
  {
    id: "pythagoras",
    emoji: "🔢",
    label: "Квадрат Пифагора",
    topic: "pythagoras_square",
    group: "profile",
    cost: QUESTION_COST,
    description: "Психоматрица и сильные стороны",
    buildMessage: () => "Разбери мой квадрат Пифагора",
  },
  {
    id: "personal_year",
    emoji: "📅",
    label: "Личный год",
    topic: "personal_cycle",
    group: "profile",
    cost: QUESTION_COST,
    description: "Что несёт текущий год",
    buildMessage: () => "Что меня ждёт в этом году?",
  },
  {
    id: "forecast_9y",
    emoji: "🔮",
    label: "Прогноз 9 лет",
    topic: "forecast_timeline",
    group: "profile",
    cost: QUESTION_COST,
    description: "Циклы судьбы на девять лет",
    buildMessage: () => "Покажи мой прогноз на 9 лет",
  },
  {
    id: "favorable_dates",
    emoji: "🍀",
    label: "Удачные даты",
    topic: "favorable_dates",
    group: "profile",
    cost: QUESTION_COST,
    description: "Благоприятные дни для решений",
    buildMessage: () => "Какие благоприятные даты для меня?",
  },
  {
    id: "karma",
    emoji: "⚖️",
    label: "Карма",
    topic: "karma",
    group: "profile",
    cost: QUESTION_COST,
    description: "Кармические уроки и долги",
    buildMessage: () => "Разбери мою карму",
  },
  {
    id: "chaldean",
    emoji: "📜",
    label: "Халдейская",
    topic: "chaldean",
    group: "profile",
    cost: QUESTION_COST,
    description: "Числа имени по халдейской системе",
    buildMessage: () => "Посчитай мои числа имени по халдейской системе",
  },
  {
    id: "compatibility",
    emoji: "💞",
    label: "Совместимость",
    topic: "compatibility",
    group: "form",
    cost: QUESTION_COST,
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
    emoji: "📱",
    label: "Число объекта",
    topic: "object_number",
    group: "form",
    cost: QUESTION_COST,
    needsForm: "phone",
    description: "Телефон, авто, адрес или бренд",
    buildMessage: (params) => {
      const value = params?.objectValue?.trim() ?? "";
      return `Число телефона ${value}`;
    },
  },
  {
    id: "spread_three_numbers",
    emoji: "✨",
    label: "Три числа",
    topic: "spread_opening",
    group: "session",
    cost: PRICING.NUMEROLOGY_SESSION,
    description: "Открывающий расклад сеанса",
    buildMessage: () => "draw_three_numbers",
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
export const NUMEROLOG_PROFILE_TOOLS = NUMEROLOG_TOOLS.filter((t) => t.group === "profile");
export const NUMEROLOG_FORM_TOOLS = NUMEROLOG_TOOLS.filter((t) => t.group === "form");
