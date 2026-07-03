export const RITUAL_TYPES = {
  love: {
    key: "love",
    label: "Притяжение",
    emoji: "💕",
    cost: 350,
    desc: "Притянуть человека или открыть путь новой любви",
    questions: [
      "Есть конкретный человек — или притягиваем нового?",
      "Что случилось — расстались, отдалились, нет отклика?",
      "Сколько времени прошло с момента когда всё изменилось?",
    ],
  },
  money: {
    key: "money",
    label: "Достаток",
    emoji: "💰",
    cost: 350,
    desc: "Открыть денежный поток, убрать блоки на достаток",
    questions: [
      "Откуда ждёшь поток — работа, бизнес, неожиданный источник?",
      "Есть долги или обязательства которые давят прямо сейчас?",
      "Было время когда деньги шли легко — что изменилось с тех пор?",
    ],
  },
  protection: {
    key: "protection",
    label: "Защита",
    emoji: "🛡",
    cost: 200,
    desc: "Очиститься от чужой энергии, поставить защиту",
    questions: [
      "Что ощущаешь — тяжесть, чужой взгляд, полосу неудач?",
      "Когда началось — был контакт с человеком который желает зла?",
      "Есть кто-то конкретный кого подозреваешь?",
    ],
  },
  luck: {
    key: "luck",
    label: "Удача",
    emoji: "🍀",
    cost: 150,
    desc: "Активировать удачу в нужной сфере жизни",
    questions: [
      "В какой сфере нужна удача — работа, отношения, здоровье, другое?",
      "Давно ощущение что не везёт — или конкретная ситуация?",
    ],
  },
  release: {
    key: "release",
    label: "Отпустить",
    emoji: "🕊",
    cost: 250,
    desc: "Отпустить человека, ситуацию или боль которая держит",
    questions: [
      "Кого или что отпускаешь — человека, ситуацию, боль?",
      "Как долго держишь это в себе?",
      "Пробовал отпустить сам — что мешает каждый раз?",
    ],
  },
} as const;

export type RitualType = keyof typeof RITUAL_TYPES;

export const RITUAL_VISUAL = {
  love: {
    emoji: "💕",
    label: "Обряд притяжения",
    color: "#e879a0",
    bg: "rgba(232,121,160,0.1)",
  },
  money: {
    emoji: "🪙",
    label: "Ритуал достатка",
    color: "#f5c842",
    bg: "rgba(245,200,66,0.1)",
  },
  protection: {
    emoji: "🛡️",
    label: "Обряд защиты",
    color: "#6b9fff",
    bg: "rgba(107,159,255,0.1)",
  },
  luck: {
    emoji: "🍀",
    label: "Ритуал удачи",
    color: "#4ade80",
    bg: "rgba(74,222,128,0.1)",
  },
  release: {
    emoji: "🕊️",
    label: "Обряд освобождения",
    color: "#e2e8f0",
    bg: "rgba(226,232,240,0.1)",
  },
} as const;

export const RITUAL_STATUS_VISUAL = {
  questions: { emoji: "🔮", label: "В процессе", color: "#a78bfa" },
  spread: { emoji: "🔮", label: "В процессе", color: "#a78bfa" },
  payment: { emoji: "🔮", label: "Ожидает оплаты", color: "#f5c842" },
  generating: { emoji: "🔮", label: "Составляется...", color: "#a78bfa" },
  completed: { emoji: "✨", label: "Проведён", color: "#4ade80" },
  reviewed: { emoji: "✅", label: "Завершён", color: "#6b9fff" },
} as const;

export const MASTER_VISUAL = {
  ragnar: { emoji: "⚔️", name: "Рагнар" },
  agafya: { emoji: "🌿", name: "Агафья" },
} as const;

export const RITUAL_TYPE_KEYS = Object.keys(RITUAL_VISUAL) as RitualType[];

export interface RitualReviewCheck {
  status: string;
  remindAt?: string | null;
  outcomeRating?: number | null;
}

/** Ритуал ждёт отзыва: completed + remind_at прошло + нет оценки. */
export function needsReview(ritual: RitualReviewCheck): boolean {
  return (
    ritual.status === "completed" &&
    !!ritual.remindAt &&
    new Date(ritual.remindAt) <= new Date() &&
    !ritual.outcomeRating
  );
}

export function isRitualInProgress(status: string): boolean {
  return ["questions", "spread", "payment", "generating"].includes(status);
}

export const RITUAL_MASTERS = ["ragnar", "agafya"] as const;

export type RitualMasterKey = (typeof RITUAL_MASTERS)[number];

export const RITUAL_MASTERS_CONFIG: Record<
  RitualMasterKey,
  { ritualTypes: RitualType[]; style: string }
> = {
  ragnar: {
    ritualTypes: ["love", "money", "protection", "luck", "release"],
    style: "огонь, руны, сталь",
  },
  agafya: {
    ritualTypes: ["love", "money", "protection", "luck", "release"],
    style: "вода, травы, земля",
  },
};

export function getMasterRitualTypes(characterKey: RitualMasterKey): RitualType[] {
  return RITUAL_MASTERS_CONFIG[characterKey].ritualTypes;
}

export function isRitualAllowedForMaster(
  characterKey: RitualMasterKey,
  ritualType: RitualType
): boolean {
  return getMasterRitualTypes(characterKey).includes(ritualType);
}

export const RITUAL_SPREAD_POSITIONS = [
  { key: "essence", label: "Суть", desc: "Что на самом деле происходит" },
  { key: "block", label: "Блок", desc: "Что мешает" },
  { key: "resource", label: "Ресурс", desc: "На что опираться" },
  { key: "action", label: "Действие", desc: "Что делать в ритуале" },
  { key: "outcome", label: "Итог", desc: "Куда движется энергия" },
] as const;

export function isRitualType(value: string): value is RitualType {
  return value in RITUAL_TYPES;
}

export function isRitualMaster(value: string): value is RitualMasterKey {
  return (RITUAL_MASTERS as readonly string[]).includes(value);
}

/** Pick ritual master when daily/tarot master cannot perform rituals. */
export function resolveRitualMasterKey(preferred?: string | null): RitualMasterKey {
  if (preferred && isRitualMaster(preferred)) return preferred;
  return "agafya";
}

/** Бейдж на витрине мастеров с обрядами. */
export const RITUAL_MASTER_SHOWCASE_BADGE = "🕯 Обряды";

export const RITUAL_INTRODUCTIONS: Record<
  RitualMasterKey,
  Partial<Record<RitualType, string>>
> = {
  ragnar: {
    love: "[Имя]. [Знак]. Вижу человека у которого что-то оборвалось. Карты покажут что. Но сначала — мне нужно понять суть.",
    money:
      "[Имя]. Деньги не уходят просто так. Где-то есть блок. Найдём. Отвечай честно — руны видят ложь.",
  },
  agafya: {
    love: "Присядь, [Имя]. Расскажи мне. Я слушаю не слова — я слушаю что за ними.",
    protection:
      "Чувствую тяжесть вокруг тебя, [Имя]. Давно это? Расскажи с начала.",
  },
};

export function getRitualIntroduction(
  characterKey: RitualMasterKey,
  ritualType: RitualType,
  userName: string,
  zodiac: string
): string {
  const template =
    RITUAL_INTRODUCTIONS[characterKey]?.[ritualType] ??
    `${userName}. Луна подсказывает путь. Ответь на мои вопросы — и я составлю обряд.`;
  return template.replace("[Имя]", userName).replace("[Знак]", zodiac || "без знака");
}

export function ritualStatusLabel(status: string): string {
  switch (status) {
    case "questions":
    case "spread":
    case "payment":
      return "ожидает";
    case "generating":
      return "готовится";
    case "completed":
      return "проведён";
    case "reviewed":
      return "отзыв оставлен";
    default:
      return status;
  }
}
