export const DEFAULT_RUNE_COSTS = {
  QUESTION: 10,
  VISION_ANALYSIS: 30,
  READING: 15,
  INTENTION_SPREAD: 20,
  DESTINY_CARD: 20,
  JOINT_READING: 25,
  DAILY_AMULET: 5,
  DAILY_EXTENDED: 10,
  FINAL_REPORT: 30,
  NATAL_READING: 20,
  FORECAST_REPORT: 20,
  SYNASTRY_REPORT: 30,
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
  INTENTION_SPREAD: "Расклад на тему",
  DESTINY_CARD: "Карта судьбы (арт)",
  JOINT_READING: "Совместный расклад",
  DAILY_AMULET: "Амулет дня",
  DAILY_EXTENDED: "Расширенный день (7 карт)",
  FINAL_REPORT: "Арт-отчёт сеанса",
  NATAL_READING: "Полная натальная трактовка",
  FORECAST_REPORT: "Персональный прогноз",
  SYNASTRY_REPORT: "Отчёт о натальной совместимости",
};

export const RUNE_ACTION_DESCRIPTIONS: Record<RuneActionType, string> = {
  QUESTION: "Каждый следующий вопрос в чате после бесплатного лимита",
  VISION_ANALYSIS: "Фото-расклад: распознавание, перерисовка и расшифровка",
  READING: "Первая полная расшифровка triplet у выбранного мастера",
  INTENTION_SPREAD: "Новый расклад на тему (стоимость зависит от схемы)",
  DESTINY_CARD: "Генерация персональной карты судьбы в чате",
  JOINT_READING: "Совместный расклад двух людей",
  DAILY_AMULET: "Карта-амулет дня",
  DAILY_EXTENDED: "Семь карт на сферы дня — один раз в сутки",
  FINAL_REPORT: "Итоговый арт-коллаж сеанса",
  NATAL_READING: "Глубокая интерпретация одной выбранной традиции: западной или ведической",
  FORECAST_REPORT: "Один персональный прогноз выбранного горизонта; списание только после явного подтверждения",
  SYNASTRY_REPORT: "Проверяемый отчёт по синастрии и композиту двух натальных карт",
};
