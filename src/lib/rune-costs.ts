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
  /** ~1500 ₽ at platform rubPerRune (prod = 5 ₽/ᚢ → 300). */
  NATAL_READING: 300,
  FORECAST_REPORT: 20,
  SYNASTRY_REPORT: 30,
  /** Full numerology / destiny matrix — ~500 ₽ (prod 5 ₽/ᚢ → 100). Matches PRICING. */
  NUMEROLOGY_SESSION: 100,
  MATRIX_SUBJECT_REPORT: 100,
  CHILD_MATRIX_REPORT: 25,
  MATRIX_PAIR_REPORT: 30,
  MATRIX_YEAR_FORECAST: 20,
  /** Human Design personal report — ~1500 ₽ (prod 5 ₽/ᚢ → 300). */
  HD_REPORT: 300,
  /** Human Design Connection Chart — same premium tier as personal. */
  HD_COMPOSITE_REPORT: 300,
  /** Human Design: follow-up question after included asks are used. */
  HD_ASK: 10,
  /** Aura reading by photo — full premium report (~250 ₽ at prod 5 ₽/ᚢ). */
  AURA_READING: 50,
  /** Palm reading by photo — full chiromancy report (~500 RUB at prod 5 RUB/rune). */
  PALM_READING: 100,
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
  NUMEROLOGY_SESSION: "Сеанс нумерологии / матрица судьбы",
  MATRIX_SUBJECT_REPORT: "Матрица на другого человека",
  CHILD_MATRIX_REPORT: "Детская матрица судьбы",
  MATRIX_PAIR_REPORT: "Парная матрица совместимости",
  MATRIX_YEAR_FORECAST: "Прогноз матрицы на 12 месяцев",
  HD_REPORT: "Дизайн Человека — полный разбор",
  HD_COMPOSITE_REPORT: "Дизайн Человека — карта связи",
  HD_ASK: "Дизайн Человека — вопрос",
  AURA_READING: "Аура по фото — полный разбор",
  PALM_READING: "Гадание по ладони — полный разбор",
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
  NUMEROLOGY_SESSION: "Полный разбор матрицы судьбы или другого нумерологического инструмента Эвелины",
  MATRIX_SUBJECT_REPORT: "Полный разбор матрицы другого человека",
  CHILD_MATRIX_REPORT: "Полный разбор детской матрицы судьбы",
  MATRIX_PAIR_REPORT: "Разбор совместимости пары по матрицам",
  MATRIX_YEAR_FORECAST: "Прогноз по матрице судьбы на 12 месяцев",
  HD_REPORT: "Полный премиальный разбор карты Дизайна Человека от Эвелины + 5 вопросов и печать/PDF",
  HD_COMPOSITE_REPORT: "Полный премиальный разбор карты связи (Connection Chart) от Эвелины + печать/PDF",
  HD_ASK: "Дополнительный вопрос по разбору после включённых в покупку",
  AURA_READING: "Полный премиальный разбор ауры по фото: цвета, слои поля, чакры и практика",
  PALM_READING: "Полный премиальный разбор ладони по фото: тип руки, линии, холмы и практика",
  VOICE_TTS: "Озвучка одного ответа наставника (длинный текст — несколько единиц)",
};

/** Scale VOICE_TTS by text length (minimum one unit). */
export function voiceTtsRuneCost(charCount: number, unitCost: number): number {
  const units = Math.max(1, Math.ceil(Math.max(0, charCount) / VOICE_TTS_CHARS_PER_UNIT));
  const unit = Number.isFinite(unitCost) && unitCost >= 0 ? Math.round(unitCost) : DEFAULT_RUNE_COSTS.VOICE_TTS;
  return units * unit;
}
