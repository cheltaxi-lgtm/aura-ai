import { parseBirthDate } from "./constants";
import type { NumerologyTopic } from "./topic-handlers";
import { PRICING } from "@/lib/config/pricing";
import { buildSessionSpreadCards } from "@/lib/intention-draw";
import type { DeckSystem, SpreadSymbol } from "@/lib/decks/types";
import { personalYearForecast } from "./forecast";

export type NumerologToolId =
  | "period_today"
  | "period_week"
  | "period_month"
  | "pythagoras"
  | "destiny_matrix"
  | "child_matrix"
  | "matrix_compatibility"
  | "matrix_year_forecast"
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
  /** Destiny-matrix subject (when not the account holder). */
  matrixSubjectId?: string;
  /** Birth date for the matrix subject (ISO or ДД.ММ.ГГГГ). */
  matrixBirthDate?: string;
  /** Display name for whose matrix is open. */
  subjectName?: string;
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
  /** Short line on the picker card. */
  tagline?: string;
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
    positions: ["Число пути", "Энергия периода", "Совет чисел"],
    tagline: "Путь, энергия периода и совет — акцент на ближайшее время",
    description: "Открывающий расчёт: три числа связывают ваш код с текущим моментом.",
    buildMessage: () => "Разбери мой расклад «Три числа»",
  },
  {
    id: "pythagoras",
    emoji: "🔢",
    label: "Квадрат Пифагора",
    topic: "pythagoras_square",
    group: "session",
    cost: SESSION_COST,
    drawCount: 0,
    positions: [],
    tagline: "Психоматрица: сильные стороны, пробелы и потенциал",
    description: "Полный квадрат Пифагора по дате рождения — только расчёт по дате, сразу по профилю.",
    buildMessage: () => "Разбери мой квадрат Пифагора",
  },
  {
    id: "destiny_matrix",
    emoji: "🌌",
    label: "Матрица судьбы",
    topic: "destiny_matrix",
    group: "session",
    cost: SESSION_COST,
    drawCount: 0,
    positions: [],
    tagline: "Полная матрица: комфорт, хвост, каналы, возраст, узел периода",
    description:
      "Полная матрица судьбы Zovus: схема бесплатна, живой разбор Эвелины — разовая покупка с сохранением, узлом периода и вопросами в чате.",
    buildMessage: () => "Построй мою матрицу судьбы",
  },
  {
    id: "child_matrix",
    emoji: "🧸",
    label: "Детская матрица",
    topic: "destiny_matrix",
    group: "session",
    cost: PRICING.CHILD_MATRIX_REPORT,
    drawCount: 0,
    positions: [],
    tagline: "Ресурсы ребёнка, обучение и бережная поддержка",
    description: "Матрица ребёнка по дате рождения: характер, таланты и опоры для родителя.",
    buildMessage: () => "Сделай детскую матрицу по дате рождения",
  },
  {
    id: "matrix_compatibility",
    emoji: "💫",
    label: "Совместимость матриц",
    topic: "matrix_compatibility",
    group: "form",
    cost: PRICING.MATRIX_PAIR_REPORT,
    drawCount: 0,
    positions: [],
    needsForm: "compat",
    tagline: "Две матрицы: комфорт, любовь, деньги, хвост, год",
    description:
      "Сравнение двух матриц судьбы по ключевым точкам — нужны ваша дата и дата партнёра.",
    buildMessage: (params) => {
      const date = params?.partnerDate?.trim() ?? "";
      const name = params?.partnerName?.trim() || "партнёр";
      return `Совместимость матриц судьбы с ${name}, дата рождения ${date}`;
    },
  },
  {
    id: "matrix_year_forecast",
    emoji: "🗓️",
    label: "Прогноз матрицы на год",
    topic: "personal_cycle",
    group: "session",
    cost: PRICING.MATRIX_YEAR_FORECAST,
    drawCount: 0,
    positions: [],
    tagline: "12 месяцев и арканы возможностей",
    description: "Годовой прогноз матрицы: ритм каждого месяца, окна возможностей и осторожности.",
    buildMessage: () => "Сделай годовой прогноз по моей матрице",
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
    tagline: "Главная тема и задачи текущего года",
    description: "Энергия личного года — на что опираться в решениях сейчас.",
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
    tagline: "Девять лет цикла — старт, пик и завершение",
    description: "Прогноз личных годов на девять лет вперёд — общая дуга, без списка «год за годом».",
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
    tagline: "Когда лучше начинать дела и принимать решения",
    description: "Благоприятные, нейтральные и осторожные даты — под ваш запрос.",
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
    tagline: "Уроки, долги и направление исцеления",
    description: "Кармический разбор — что проработать и куда двигаться мягче.",
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
    tagline: "Числа имени по древней халдейской системе",
    description: "Душа, личность и судьба по полному ФИО — нужны имя и фамилия.",
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
    tagline: "Сильные стороны пары и точки роста",
    description: "Сравнение двух людей — укажите имя и дату рождения партнёра.",
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
    tagline: "Вибрация телефона, авто, адреса или названия",
    description: "Эвелина определит тип объекта и посчитает его число.",
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

/** Tools calculated from birth date only — no drawable number "cards". */
export function numerologComputedOnlyTool(toolId: NumerologToolId): boolean {
  return numerologToolDrawCount(toolId) === 0;
}

export function numerologToolPositions(
  toolId: NumerologToolId,
  opts?: { fromYear?: number }
): string[] {
  if (toolId === "forecast_9y") {
    const start = opts?.fromYear ?? new Date().getFullYear();
    return Array.from({ length: 9 }, (_, i) => String(start + i));
  }
  return getNumerologTool(toolId).positions;
}

export function numerologSpreadLabel(spreadId?: string | null): string | null {
  const toolId = decodeNumerologSpreadId(spreadId);
  if (!toolId) return null;
  return getNumerologTool(toolId).label;
}

/** Stable cache key for numerolog spread readings (history + idempotency). */
export function numerologReadingCacheKey(input: {
  characterId: string;
  toolId: NumerologToolId | string;
  birthDate?: string | null;
  cardNames: string[];
  params?: NumerologToolParams | null;
  matrixSubjectId?: string | null;
}): string {
  return [
    "numerolog",
    input.characterId,
    input.toolId,
    input.birthDate?.trim() || "no-birth",
    input.matrixSubjectId?.trim() || "self-subject",
    input.cardNames.join("|") || "no-draw",
    JSON.stringify(input.params ?? {}),
  ].join(":");
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

/** Stored in sessions.spread_id to persist the active numerolog calculation type. */
export const NUMEROLOG_SPREAD_ID_PREFIX = "numerolog:";

export function encodeNumerologSpreadId(toolId: NumerologToolId): string {
  return `${NUMEROLOG_SPREAD_ID_PREFIX}${toolId}`;
}

export function decodeNumerologSpreadId(
  spreadId?: string | null
): NumerologToolId | null {
  if (!spreadId?.startsWith(NUMEROLOG_SPREAD_ID_PREFIX)) return null;
  const id = spreadId.slice(NUMEROLOG_SPREAD_ID_PREFIX.length);
  return isNumerologSessionToolId(id) ? id : null;
}

export function resolveNumerologToolId(
  spreadId?: string | null,
  explicitToolId?: NumerologToolId | null
): NumerologToolId {
  return explicitToolId ?? decodeNumerologSpreadId(spreadId) ?? DEFAULT_NUMEROLOG_SESSION_TOOL;
}

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
  "destiny_matrix",
  // child_matrix uses the child's subject birth date, not the parent profile.
  "matrix_compatibility",
  "matrix_year_forecast",
  "personal_year",
  "forecast_9y",
  "favorable_dates",
  "karma",
  "chaldean",
  "compatibility",
]);

export function numerologSessionNeedsBirthDate(toolId: NumerologToolId): boolean {
  return NUMEROLOG_BIRTH_DATE_TOOLS.has(toolId);
}

/** Session tools that need a non-empty name in the user profile. */
export const NUMEROLOG_NAME_TOOLS = new Set<NumerologToolId>(["chaldean", "karma"]);

export function numerologSessionNeedsFullName(toolId: NumerologToolId): boolean {
  return NUMEROLOG_NAME_TOOLS.has(toolId);
}

export function validateNumerologSessionReady(
  toolId: NumerologToolId,
  params?: NumerologToolParams,
  birthDate?: string | null,
  fullName?: string | null
): string | null {
  const paramError = validateNumerologToolParams(toolId, params);
  if (paramError) return paramError;
  if (numerologSessionNeedsBirthDate(toolId) && !parseBirthDate(birthDate ?? "")) {
    return "Укажите дату рождения в профиле — без неё этот расчёт недоступен.";
  }
  if (numerologSessionNeedsFullName(toolId) && !(fullName?.trim())) {
    return "Укажите имя в профиле — без него этот расчёт недоступен.";
  }
  return null;
}

export function validatePartnerInfo(params?: NumerologToolParams | null): string | null {
  const date = params?.partnerDate?.trim() ?? "";
  if (!date) return "Укажите дату рождения партнёра.";
  if (!parseBirthDate(date)) {
    return "Некорректная дата. Формат: ДД.ММ.ГГГГ (например, 17.03.1993).";
  }
  return null;
}

export function partnerInfoReady(params?: NumerologToolParams | null): boolean {
  return validatePartnerInfo(params) === null;
}

export function formatPartnerContext(params?: NumerologToolParams | null): string {
  const date = params?.partnerDate?.trim();
  if (!date) return "";
  const name = params?.partnerName?.trim() || "партнёр";
  return `Партнёр: ${name}, дата рождения ${date}.`;
}

export function appendPartnerContextToQuestion(
  question: string,
  params?: NumerologToolParams | null
): string {
  const base = question.trim();
  const ctx = formatPartnerContext(params);
  if (!base) return ctx;
  if (!ctx) return base;
  return `${base} ${ctx}`;
}

export function parseNumerologToolParams(raw: {
  partnerName?: string | null;
  partnerDate?: string | null;
  objectValue?: string | null;
  matrixSubjectId?: string | null;
  matrixBirthDate?: string | null;
  subjectName?: string | null;
}): NumerologToolParams {
  const partnerName = raw.partnerName?.trim();
  const partnerDate = raw.partnerDate?.trim();
  const objectValue = raw.objectValue?.trim();
  const matrixSubjectId = raw.matrixSubjectId?.trim();
  const matrixBirthDate = raw.matrixBirthDate?.trim();
  const subjectName = raw.subjectName?.trim();
  return {
    ...(partnerName ? { partnerName } : {}),
    ...(partnerDate ? { partnerDate } : {}),
    ...(objectValue ? { objectValue } : {}),
    ...(matrixSubjectId ? { matrixSubjectId } : {}),
    ...(matrixBirthDate ? { matrixBirthDate } : {}),
    ...(subjectName ? { subjectName } : {}),
  };
}

/** Build spread symbols for a numerolog session tool (respects per-tool drawCount). */
export function buildNumerologSpreadCards(
  characterKey: string,
  cardNames: string[],
  toolId: NumerologToolId,
  options?: {
    previewCards?: { name: string; meaning?: string }[];
    deckSystem?: DeckSystem;
    birthDate?: string | null;
  }
): { spreadCards: SpreadSymbol[]; system: DeckSystem } {
  const drawCount = numerologToolDrawCount(toolId);
  const fromYear = new Date().getFullYear();
  let previewCards = options?.previewCards;

  if (toolId === "forecast_9y" && options?.birthDate && parseBirthDate(options.birthDate)) {
    const forecast = personalYearForecast(options.birthDate, fromYear, 9);
    previewCards = cardNames.map((name, i) => ({
      name,
      meaning:
        forecast[i] != null
          ? `${forecast[i].year} · личный год ${forecast[i].number}`
          : previewCards?.[i]?.meaning,
    }));
  }

  const built = buildSessionSpreadCards(characterKey, cardNames, {
    ...options,
    previewCards,
    cardCount: drawCount,
    positionLabels: numerologToolPositions(toolId, { fromYear }),
  });

  if (toolId === "forecast_9y" && options?.birthDate && parseBirthDate(options.birthDate)) {
    const forecast = personalYearForecast(options.birthDate, fromYear, 9);
    return {
      ...built,
      spreadCards: built.spreadCards.map((c, i) => ({
        ...c,
        meaning: forecast[i]
          ? `${forecast[i].year} · личный год ${forecast[i].number}`
          : c.meaning,
      })),
    };
  }

  return built;
}
