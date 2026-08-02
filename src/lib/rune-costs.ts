export const DEFAULT_RUNE_COSTS = {
  QUESTION: 10,
  VISION_ANALYSIS: 30,
  READING: 15,
  INTENTION_SPREAD: 20,
  DESTINY_CARD: 20,
  /** Chat scene illustration (AI image). */
  SCENE_ILLUSTRATION: 10,
  /** Atmosphere / spread background art. */
  TAROT_ATMOSPHERE: 8,
  JOINT_READING: 25,
  DAILY_AMULET: 5,
  DAILY_EXTENDED: 10,
  FINAL_REPORT: 30,
  NATAL_READING: 20,
  FORECAST_REPORT: 20,
  SYNASTRY_REPORT: 30,
  /** Per TTS request; long texts scale by VOICE_TTS_CHARS_PER_UNIT below. */
  VOICE_TTS: 2,
} as const;

/** Extra VOICE_TTS units charged per this many characters (ceil). */
export const VOICE_TTS_CHARS_PER_UNIT = 2000;

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
  SCENE_ILLUSTRATION: "Иллюстрация к ответу",
  TAROT_ATMOSPHERE: "Атмосфера расклада",
  JOINT_READING: "Совместный расклад",
  DAILY_AMULET: "Амулет дня",
  DAILY_EXTENDED: "Расширенный день (7 карт)",
  FINAL_REPORT: "Арт-отчёт сеанса",
  NATAL_READING: "Полная натальная трактовка",
  FORECAST_REPORT: "Персональный прогноз",
  SYNASTRY_REPORT: "Отчёт о натальной совместимости",
  VOICE_TTS: "Озвучка ответа",
};

export const RUNE_ACTION_DESCRIPTIONS: Record<RuneActionType, string> = {
  QUESTION: "Каждый следующий вопрос в чате после бесплатного лимита",
  VISION_ANALYSIS: "Фото-расклад: распознавание, перерисовка и расшифровка",
  READING: "Первая полная расшифровка triplet у выбранного мастера",
  INTENTION_SPREAD: "Новый расклад на тему (стоимость зависит от схемы)",
  DESTINY_CARD: "Генерация персональной карты судьбы в чате",
  SCENE_ILLUSTRATION: "AI-иллюстрация к ответу мастера в чате",
  TAROT_ATMOSPHERE: "Фон / атмосфера расклада",
  JOINT_READING: "Совместный расклад двух людей",
  DAILY_AMULET: "Карта-амулет дня",
  DAILY_EXTENDED: "Семь карт на сферы дня — один раз в сутки",
  FINAL_REPORT: "Итоговый арт-коллаж сеанса",
  NATAL_READING: "Глубокая интерпретация одной выбранной традиции: западной или ведической",
  FORECAST_REPORT: "Один персональный прогноз выбранного горизонта; списание только после явного подтверждения",
  SYNASTRY_REPORT: "Проверяемый отчёт по синастрии и композиту двух натальных карт",
  VOICE_TTS: "Озвучка одного ответа наставника (длинный текст — несколько единиц)",
};

/** Scale VOICE_TTS by text length (minimum one unit). */
export function voiceTtsRuneCost(charCount: number, unitCost: number): number {
  const units = Math.max(1, Math.ceil(Math.max(0, charCount) / VOICE_TTS_CHARS_PER_UNIT));
  const unit = Number.isFinite(unitCost) && unitCost >= 0 ? Math.round(unitCost) : DEFAULT_RUNE_COSTS.VOICE_TTS;
  return units * unit;
}
