/**
 * Human Design reference tables (Rave Mandala).
 *
 * Gate order verified against the canonical mandala: Gate 41 starts at
 * 02°00'00" Aquarius (302°), equivalently Gate 25 starts at 358°15'.
 * Each gate spans 5.625° (5°37'30"), each line 0.9375° (0°56'15").
 * Boundary rule: intervals are [start, end) — a position exactly on a
 * boundary belongs to the gate/line starting there.
 */

import type {
  HdAuthorityKey,
  HdCenterKey,
  HdCrossAngle,
  HdTypeKey,
} from "./types";

/** Longitude where the wheel starts: Gate 25 begins at 358°15' (28°15' Pisces). */
export const GATE_WHEEL_OFFSET = 358.25;
export const GATE_SIZE_DEG = 5.625;
export const LINE_SIZE_DEG = 0.9375;
export const COLOR_SIZE_DEG = 0.15625;
export const TONE_SIZE_DEG = COLOR_SIZE_DEG / 6;
export const BASE_SIZE_DEG = TONE_SIZE_DEG / 5;

/** Gates in wheel order starting from Gate 25. */
export const GATE_ORDER: readonly number[] = [
  25, 17, 21, 51, 42, 3,
  27, 24, 2, 23, 8, 20,
  16, 35, 45, 12, 15, 52,
  39, 53, 62, 56, 31, 33,
  7, 4, 29, 59, 40, 64,
  47, 6, 46, 18, 48, 57,
  32, 50, 28, 44, 1, 43,
  14, 34, 9, 5, 26, 11,
  10, 58, 38, 54, 61, 60,
  41, 19, 13, 49, 30, 55,
  37, 63, 22, 36,
];

export const GATE_CENTERS: Record<number, HdCenterKey> = {
  1: "g", 2: "g", 3: "sacral", 4: "ajna", 5: "sacral", 6: "solar",
  7: "g", 8: "throat", 9: "sacral", 10: "g", 11: "ajna", 12: "throat",
  13: "g", 14: "sacral", 15: "g", 16: "throat", 17: "ajna", 18: "spleen",
  19: "root", 20: "throat", 21: "heart", 22: "solar", 23: "throat",
  24: "ajna", 25: "g", 26: "heart", 27: "sacral", 28: "spleen",
  29: "sacral", 30: "solar", 31: "throat", 32: "spleen", 33: "throat",
  34: "sacral", 35: "throat", 36: "solar", 37: "solar", 38: "root",
  39: "root", 40: "heart", 41: "root", 42: "sacral", 43: "ajna",
  44: "spleen", 45: "throat", 46: "g", 47: "ajna", 48: "spleen",
  49: "solar", 50: "spleen", 51: "heart", 52: "root", 53: "root",
  54: "root", 55: "solar", 56: "throat", 57: "spleen", 58: "root",
  59: "sacral", 60: "root", 61: "head", 62: "throat", 63: "head",
  64: "head",
};

/** I-Цзин-based RU gate names (public domain hexagram names, own rendering). */
export const GATE_NAMES_RU: Record<number, string> = {
  1: "Творчество", 2: "Восприимчивость", 3: "Трудность в начале",
  4: "Юношеская незрелость", 5: "Ожидание", 6: "Трение",
  7: "Войско", 8: "Сближение", 9: "Малое накопление",
  10: "Наступление", 11: "Мир", 12: "Застой",
  13: "Единомышленники", 14: "Большое обладание", 15: "Скромность",
  16: "Воодушевление", 17: "Следование", 18: "Работа над испорченным",
  19: "Приближение", 20: "Созерцание", 21: "Укус",
  22: "Грация", 23: "Раскол", 24: "Возвращение",
  25: "Невинность", 26: "Великое накопление", 27: "Питание",
  28: "Превосходство великого", 29: "Бездна", 30: "Сияние",
  31: "Влияние", 32: "Длительность", 33: "Отступление",
  34: "Великая мощь", 35: "Прогресс", 36: "Затмение света",
  37: "Семья", 38: "Противостояние", 39: "Препятствие",
  40: "Освобождение", 41: "Уменьшение", 42: "Увеличение",
  43: "Прорыв", 44: "Встреча", 45: "Собирание",
  46: "Восхождение", 47: "Угнетение", 48: "Колодец",
  49: "Революция", 50: "Треножник", 51: "Гром",
  52: "Гора", 53: "Развитие", 54: "Невеста",
  55: "Изобилие", 56: "Странник", 57: "Проникновение",
  58: "Радость", 59: "Рассеивание", 60: "Предел",
  61: "Внутренняя правда", 62: "Малое превосходство", 63: "После завершения",
  64: "Перед завершением",
};

export interface HdChannelDef {
  gates: [number, number];
  centers: [HdCenterKey, HdCenterKey];
  nameRu: string;
  nameEn: string;
}

export const CHANNELS: readonly HdChannelDef[] = [
  { gates: [1, 8], centers: ["g", "throat"], nameRu: "Вдохновение", nameEn: "Inspiration" },
  { gates: [2, 14], centers: ["g", "sacral"], nameRu: "Бит", nameEn: "The Beat" },
  { gates: [3, 60], centers: ["sacral", "root"], nameRu: "Мутация", nameEn: "Mutation" },
  { gates: [4, 63], centers: ["ajna", "head"], nameRu: "Логика", nameEn: "Logic" },
  { gates: [5, 15], centers: ["sacral", "g"], nameRu: "Ритм", nameEn: "Rhythm" },
  { gates: [6, 59], centers: ["solar", "sacral"], nameRu: "Близость", nameEn: "Intimacy" },
  { gates: [7, 31], centers: ["g", "throat"], nameRu: "Альфа", nameEn: "Alpha" },
  { gates: [9, 52], centers: ["sacral", "root"], nameRu: "Сосредоточение", nameEn: "Concentration" },
  { gates: [10, 20], centers: ["g", "throat"], nameRu: "Пробуждение", nameEn: "Awakening" },
  { gates: [10, 34], centers: ["g", "sacral"], nameRu: "Исследование", nameEn: "Exploration" },
  { gates: [10, 57], centers: ["g", "spleen"], nameRu: "Совершенная форма", nameEn: "Perfected Form" },
  { gates: [11, 56], centers: ["ajna", "throat"], nameRu: "Любопытство", nameEn: "Curiosity" },
  { gates: [12, 22], centers: ["throat", "solar"], nameRu: "Открытость", nameEn: "Openness" },
  { gates: [13, 33], centers: ["g", "throat"], nameRu: "Блудный сын", nameEn: "The Prodigal" },
  { gates: [16, 48], centers: ["throat", "spleen"], nameRu: "Волна", nameEn: "The Wavelength" },
  { gates: [17, 62], centers: ["ajna", "throat"], nameRu: "Принятие", nameEn: "Acceptance" },
  { gates: [18, 58], centers: ["spleen", "root"], nameRu: "Суждение", nameEn: "Judgement" },
  { gates: [19, 49], centers: ["root", "solar"], nameRu: "Синтез", nameEn: "Synthesis" },
  { gates: [20, 34], centers: ["throat", "sacral"], nameRu: "Харизма", nameEn: "Charisma" },
  { gates: [20, 57], centers: ["throat", "spleen"], nameRu: "Мозговая волна", nameEn: "The Brainwave" },
  { gates: [21, 45], centers: ["heart", "throat"], nameRu: "Деньги", nameEn: "Money" },
  { gates: [23, 43], centers: ["throat", "ajna"], nameRu: "Структурирование", nameEn: "Structuring" },
  { gates: [24, 61], centers: ["ajna", "head"], nameRu: "Осознанность", nameEn: "Awareness" },
  { gates: [25, 51], centers: ["g", "heart"], nameRu: "Инициация", nameEn: "Initiation" },
  { gates: [26, 44], centers: ["heart", "spleen"], nameRu: "Передача", nameEn: "Surrender" },
  { gates: [27, 50], centers: ["sacral", "spleen"], nameRu: "Сохранение", nameEn: "Preservation" },
  { gates: [28, 38], centers: ["spleen", "root"], nameRu: "Борьба", nameEn: "Struggle" },
  { gates: [29, 46], centers: ["sacral", "g"], nameRu: "Открытие", nameEn: "Discovery" },
  { gates: [30, 41], centers: ["solar", "root"], nameRu: "Признание", nameEn: "Recognition" },
  { gates: [32, 54], centers: ["spleen", "root"], nameRu: "Трансформация", nameEn: "Transformation" },
  { gates: [34, 57], centers: ["sacral", "spleen"], nameRu: "Сила", nameEn: "Power" },
  { gates: [35, 36], centers: ["throat", "solar"], nameRu: "Перемены", nameEn: "Transitoriness" },
  { gates: [37, 40], centers: ["solar", "heart"], nameRu: "Сообщество", nameEn: "Community" },
  { gates: [39, 55], centers: ["root", "solar"], nameRu: "Эмоциональность", nameEn: "Emoting" },
  { gates: [42, 53], centers: ["sacral", "root"], nameRu: "Созревание", nameEn: "Maturation" },
  { gates: [47, 64], centers: ["ajna", "head"], nameRu: "Абстракция", nameEn: "Abstraction" },
];

export const CENTER_NAMES_RU: Record<HdCenterKey, string> = {
  head: "Головной",
  ajna: "Аджна",
  throat: "Горловой",
  g: "G-центр",
  heart: "Эго (Сердце)",
  sacral: "Сакральный",
  solar: "Эмоциональный",
  spleen: "Селезёночный",
  root: "Корневой",
};

/** Motor centers per HD: Sacral, Solar Plexus, Heart/Ego, Root. */
export const MOTOR_CENTERS: readonly HdCenterKey[] = [
  "sacral",
  "solar",
  "heart",
  "root",
];

export const TYPE_META: Record<
  HdTypeKey,
  { nameRu: string; strategyRu: string; signatureRu: string; notSelfRu: string }
> = {
  manifestor: {
    nameRu: "Манифестор",
    strategyRu: "Информировать",
    signatureRu: "Покой",
    notSelfRu: "Гнев",
  },
  generator: {
    nameRu: "Генератор",
    strategyRu: "Ждать отклика",
    signatureRu: "Удовлетворение",
    notSelfRu: "Фрустрация",
  },
  manifestingGenerator: {
    nameRu: "Манифестирующий генератор",
    strategyRu: "Ждать отклика, затем информировать",
    signatureRu: "Удовлетворение",
    notSelfRu: "Фрустрация и гнев",
  },
  projector: {
    nameRu: "Проектор",
    strategyRu: "Ждать приглашения",
    signatureRu: "Успех",
    notSelfRu: "Горечь",
  },
  reflector: {
    nameRu: "Рефлектор",
    strategyRu: "Ждать лунный цикл",
    signatureRu: "Удивление",
    notSelfRu: "Разочарование",
  },
};

export const AUTHORITY_NAMES_RU: Record<HdAuthorityKey, string> = {
  emotional: "Эмоциональный",
  sacral: "Сакральный",
  splenic: "Селезёночный",
  egoManifested: "Эго-манифестированный",
  egoProjected: "Эго-проецированный",
  selfProjected: "Само-проецированный",
  mental: "Ментальный (внешний)",
  lunar: "Лунный",
};

/** The only 12 valid profiles — anything else is a calculation bug (R-8). */
export const VALID_PROFILES: readonly string[] = [
  "1/3", "1/4", "2/4", "2/5", "3/5", "3/6",
  "4/6", "4/1", "5/1", "5/2", "6/2", "6/3",
];

export const PROFILE_NAMES_RU: Record<string, string> = {
  "1/3": "Исследователь / Мученик",
  "1/4": "Исследователь / Оппортунист",
  "2/4": "Отшельник / Оппортунист",
  "2/5": "Отшельник / Еретик",
  "3/5": "Мученик / Еретик",
  "3/6": "Мученик / Ролевая модель",
  "4/6": "Оппортунист / Ролевая модель",
  "4/1": "Оппортунист / Исследователь",
  "5/1": "Еретик / Исследователь",
  "5/2": "Еретик / Отшельник",
  "6/2": "Ролевая модель / Отшельник",
  "6/3": "Ролевая модель / Мученик",
};

const RIGHT_ANGLE_PROFILES = new Set(["1/3", "1/4", "2/4", "2/5", "3/5", "3/6"]);

export function crossAngleFromProfile(profile: string): HdCrossAngle {
  if (RIGHT_ANGLE_PROFILES.has(profile)) return "right";
  if (profile === "4/1") return "juxtaposition";
  return "left";
}

export const CROSS_ANGLE_NAMES_RU: Record<HdCrossAngle, string> = {
  right: "Прямой угол",
  juxtaposition: "Джукстапозиция",
  left: "Левый угол",
};

/**
 * Incarnation cross names by Personality Sun gate: [right, juxtaposition, left].
 * Canonical English names; RU rendering below.
 */
export const CROSS_NAMES_EN: Record<number, [string, string, string]> = {
  1: ["The Sphinx", "Self-Expression", "Defiance"],
  2: ["The Sphinx", "The Driver", "Defiance"],
  3: ["Laws", "Mutation", "Wishes"],
  4: ["Explanation", "Formulization", "Revolution"],
  5: ["Consciousness", "Habits", "Separation"],
  6: ["Eden", "Conflict", "The Plane"],
  7: ["The Sphinx", "Interaction", "The Masks"],
  8: ["Contagion", "Contribution", "Uncertainty"],
  9: ["Planning", "Focus", "Identification"],
  10: ["The Vessel of Love", "Behavior", "Prevention"],
  11: ["Eden", "Ideas", "Education"],
  12: ["Eden", "Articulation", "Education"],
  13: ["The Sphinx", "Listening", "The Masks"],
  14: ["Contagion", "Empowering", "Uncertainty"],
  15: ["The Vessel of Love", "Extremes", "Prevention"],
  16: ["Planning", "Experimentation", "Identification"],
  17: ["Service", "Opinions", "Upheaval"],
  18: ["Service", "Correction", "Upheaval"],
  19: ["The Four Ways", "Need", "Refinement"],
  20: ["The Sleeping Phoenix", "The Now", "Duality"],
  21: ["Tension", "Control", "Endeavor"],
  22: ["Rulership", "Grace", "Informing"],
  23: ["Explanation", "Assimilation", "Dedication"],
  24: ["The Four Ways", "Rationalization", "Incarnation"],
  25: ["The Vessel of Love", "Innocence", "Healing"],
  26: ["Rulership", "The Trickster", "Confrontation"],
  27: ["The Unexpected", "Caring", "Alignment"],
  28: ["The Unexpected", "Risks", "Alignment"],
  29: ["Contagion", "Commitment", "Industry"],
  30: ["Contagion", "Fates", "Industry"],
  31: ["The Unexpected", "Influence", "The Alpha"],
  32: ["Maya", "Conservation", "Limitation"],
  33: ["The Four Ways", "Retreat", "Refinement"],
  34: ["The Sleeping Phoenix", "Power", "Duality"],
  35: ["Consciousness", "Experience", "Separation"],
  36: ["Eden", "Crisis", "The Plane"],
  37: ["Planning", "Bargains", "Migration"],
  38: ["Tension", "Opposition", "Individualism"],
  39: ["Tension", "Provocation", "Individualism"],
  40: ["Planning", "Denial", "Migration"],
  41: ["The Unexpected", "Fantasy", "The Alpha"],
  42: ["Maya", "Completion", "Limitation"],
  43: ["Explanation", "Insight", "Dedication"],
  44: ["The Four Ways", "Alertness", "Incarnation"],
  45: ["Rulership", "Possession", "Confrontation"],
  46: ["The Vessel of Love", "Serendipity", "Healing"],
  47: ["Rulership", "Oppression", "Informing"],
  48: ["Tension", "Depth", "Endeavor"],
  49: ["Explanation", "Principles", "Revolution"],
  50: ["Laws", "Values", "Wishes"],
  51: ["Penetration", "Shock", "The Clarion"],
  52: ["Service", "Stillness", "Demands"],
  53: ["Penetration", "Beginnings", "Cycles"],
  54: ["Penetration", "Ambition", "Cycles"],
  55: ["The Sleeping Phoenix", "Moods", "Spirit"],
  56: ["Laws", "Stimulation", "Distraction"],
  57: ["Penetration", "Intuition", "The Clarion"],
  58: ["Service", "Vitality", "Demands"],
  59: ["The Sleeping Phoenix", "Strategy", "Spirit"],
  60: ["Laws", "Limitation", "Distraction"],
  61: ["Maya", "Thinking", "Obscuration"],
  62: ["Maya", "Details", "Obscuration"],
  63: ["Consciousness", "Doubts", "Dominion"],
  64: ["Consciousness", "Confusion", "Dominion"],
};

/** Own RU renderings of the cross names (genitive case: «Крест …»). */
export const CROSS_NAMES_RU: Record<number, [string, string, string]> = {
  1: ["Сфинкса", "Самовыражения", "Вызова"],
  2: ["Сфинкса", "Водителя", "Вызова"],
  3: ["Законов", "Мутации", "Желаний"],
  4: ["Объяснения", "Формализации", "Революции"],
  5: ["Осознанности", "Привычек", "Разделения"],
  6: ["Эдема", "Конфликта", "Плана"],
  7: ["Сфинкса", "Взаимодействия", "Масок"],
  8: ["Заражения", "Вклада", "Неопределённости"],
  9: ["Планирования", "Фокуса", "Идентификации"],
  10: ["Сосуда Любви", "Поведения", "Предотвращения"],
  11: ["Эдема", "Идей", "Образования"],
  12: ["Эдема", "Артикуляции", "Образования"],
  13: ["Сфинкса", "Слушания", "Масок"],
  14: ["Заражения", "Наделения силой", "Неопределённости"],
  15: ["Сосуда Любви", "Крайностей", "Предотвращения"],
  16: ["Планирования", "Эксперимента", "Идентификации"],
  17: ["Служения", "Мнений", "Потрясения"],
  18: ["Служения", "Исправления", "Потрясения"],
  19: ["Четырёх Путей", "Нужды", "Утончения"],
  20: ["Спящего Феникса", "Сейчас", "Двойственности"],
  21: ["Напряжения", "Контроля", "Усилия"],
  22: ["Правления", "Грации", "Информирования"],
  23: ["Объяснения", "Ассимиляции", "Преданности"],
  24: ["Четырёх Путей", "Рационализации", "Инкарнации"],
  25: ["Сосуда Любви", "Невинности", "Исцеления"],
  26: ["Правления", "Плута", "Противостояния"],
  27: ["Неожиданного", "Заботы", "Выравнивания"],
  28: ["Неожиданного", "Рисков", "Выравнивания"],
  29: ["Заражения", "Обязательства", "Трудолюбия"],
  30: ["Заражения", "Судеб", "Трудолюбия"],
  31: ["Неожиданного", "Влияния", "Альфы"],
  32: ["Майи", "Сохранения", "Ограничения"],
  33: ["Четырёх Путей", "Отступления", "Утончения"],
  34: ["Спящего Феникса", "Силы", "Двойственности"],
  35: ["Осознанности", "Опыта", "Разделения"],
  36: ["Эдема", "Кризиса", "Плана"],
  37: ["Планирования", "Сделок", "Миграции"],
  38: ["Напряжения", "Противостояния", "Индивидуализма"],
  39: ["Напряжения", "Провокации", "Индивидуализма"],
  40: ["Планирования", "Отрицания", "Миграции"],
  41: ["Неожиданного", "Фантазии", "Альфы"],
  42: ["Майи", "Завершения", "Ограничения"],
  43: ["Объяснения", "Прозрения", "Преданности"],
  44: ["Четырёх Путей", "Бдительности", "Инкарнации"],
  45: ["Правления", "Обладания", "Противостояния"],
  46: ["Сосуда Любви", "Удачной случайности", "Исцеления"],
  47: ["Правления", "Угнетения", "Информирования"],
  48: ["Напряжения", "Глубины", "Усилия"],
  49: ["Объяснения", "Принципов", "Революции"],
  50: ["Законов", "Ценностей", "Желаний"],
  51: ["Проникновения", "Шока", "Призыва"],
  52: ["Служения", "Неподвижности", "Требований"],
  53: ["Проникновения", "Начал", "Циклов"],
  54: ["Проникновения", "Амбиций", "Циклов"],
  55: ["Спящего Феникса", "Настроений", "Духа"],
  56: ["Законов", "Стимуляции", "Рассеяния"],
  57: ["Проникновения", "Интуиции", "Призыва"],
  58: ["Служения", "Жизненной силы", "Требований"],
  59: ["Спящего Феникса", "Стратегии", "Духа"],
  60: ["Законов", "Ограничения", "Рассеяния"],
  61: ["Майи", "Мышления", "Затемнения"],
  62: ["Майи", "Деталей", "Затемнения"],
  63: ["Осознанности", "Сомнений", "Господства"],
  64: ["Осознанности", "Замешательства", "Господства"],
};

export const DEFINITION_NAMES_RU: Record<string, string> = {
  none: "Нет определённости",
  single: "Одиночная определённость",
  split: "Раздвоённая определённость",
  tripleSplit: "Тройная раздвоённость",
  quadrupleSplit: "Четверная раздвоённость",
};
