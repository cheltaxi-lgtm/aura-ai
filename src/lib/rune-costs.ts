export const DEFAULT_RUNE_COSTS = {
  QUESTION: 10,
  VISION_ANALYSIS: 15,
  READING: 15,
  DESTINY_CARD: 20,
  JOINT_READING: 25,
  DAILY_AMULET: 5,
  FINAL_REPORT: 30,
} as const;

export type RuneActionType = keyof typeof DEFAULT_RUNE_COSTS;

/** @deprecated use getRuneSettings() on server */
export const RUNE_COSTS = DEFAULT_RUNE_COSTS;

/** @deprecated use getRuneSettings().freeQuestions */
export const FREE_RUNE_QUESTIONS = 2;

export const RUNE_ACTION_LABELS: Record<RuneActionType, string> = {
  QUESTION: "Вопрос мастеру",
  VISION_ANALYSIS: "Фото-расклад",
  READING: "Расшифровка 3 карт",
  DESTINY_CARD: "Карта судьбы (арт)",
  JOINT_READING: "Совместный расклад",
  DAILY_AMULET: "Амулет дня",
  FINAL_REPORT: "Арт-отчёт сеанса",
};

export const RUNE_ACTION_DESCRIPTIONS: Record<RuneActionType, string> = {
  QUESTION: "Каждый следующий вопрос в чате после бесплатного лимита",
  VISION_ANALYSIS: "Разбор расклада по загруженному фото",
  READING: "Первая полная расшифровка triplet у выбранного мастера",
  DESTINY_CARD: "Генерация персональной карты судьбы в чате",
  JOINT_READING: "Совместный расклад двух людей",
  DAILY_AMULET: "Карта-амулет дня",
  FINAL_REPORT: "Итоговый арт-коллаж сеанса",
};
