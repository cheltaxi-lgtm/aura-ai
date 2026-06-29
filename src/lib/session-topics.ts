import type { SessionIntention } from "@/lib/intention";
import type { DrawIntention } from "@/lib/intention-draw";

export type SessionTopicId =
  | "love"
  | "money"
  | "health"
  | "path"
  | "enemies"
  | "sign"
  | "life_death"
  | "custom";

export interface SessionTopicDef {
  id: SessionTopicId;
  icon: string;
  label: string;
  sub?: string;
  focus: string;
}

export const SESSION_TOPICS: SessionTopicDef[] = [
  { id: "love", icon: "❤️", label: "Любовь и отношения", focus: "сердце, союз, отношения" },
  { id: "money", icon: "💰", label: "Деньги и карьера", focus: "ресурс, работа, стабильность" },
  { id: "health", icon: "🌿", label: "Здоровье и энергия", focus: "тело, силы, восстановление" },
  { id: "path", icon: "🔮", label: "Мой путь", focus: "предназначение, выбор, направление" },
  { id: "enemies", icon: "⚔️", label: "Враги и защита", focus: "конфликт, защита, стратегия" },
  { id: "sign", icon: "✨", label: "Знак свыше", focus: "знамение, смысл, послание" },
  {
    id: "life_death",
    icon: "🔍",
    label: "Вести о человеке",
    sub: "Нет связи · Пропажа · Долго молчит",
    focus: "человек без вестей, тревога, поиск",
  },
  {
    id: "custom",
    icon: "💬",
    label: "Свой вопрос",
    focus: "личный запрос клиента",
  },
];

const TOPIC_TO_LEGACY: Record<SessionTopicId, SessionIntention | "life_death" | "custom"> = {
  love: "Любовь",
  money: "Деньги",
  health: "Здоровье",
  path: "Мой путь",
  enemies: "Враги",
  sign: "Знак свыше",
  life_death: "life_death",
  custom: "custom",
};

const LEGACY_TO_TOPIC: Partial<Record<SessionIntention, SessionTopicId>> = {
  Любовь: "love",
  Деньги: "money",
  Здоровье: "health",
  "Мой путь": "path",
  Враги: "enemies",
  "Знак свыше": "sign",
};

export function isSessionTopicId(value: string): value is SessionTopicId {
  return SESSION_TOPICS.some((t) => t.id === value);
}

export function getSessionTopic(value: string): SessionTopicDef | undefined {
  if (isSessionTopicId(value)) {
    return SESSION_TOPICS.find((t) => t.id === value);
  }
  const mapped = LEGACY_TO_TOPIC[value as SessionIntention];
  return mapped ? SESSION_TOPICS.find((t) => t.id === mapped) : undefined;
}

export function topicLabel(value: string): string {
  return getSessionTopic(value)?.label ?? value;
}

/** Key for card draw bias (legacy Russian labels + life_death + custom). */
export function topicToDrawKey(value: string): SessionIntention | "life_death" | "custom" {
  if (isSessionTopicId(value)) return TOPIC_TO_LEGACY[value];
  if (value === "life_death" || value === "custom") return value;
  return value as SessionIntention;
}

/** Draw bias key for intention spread — not for `custom` (use uniform draw). */
export function topicToDrawIntention(value: string): DrawIntention {
  const key = topicToDrawKey(value);
  if (key === "custom") {
    throw new Error(`topicToDrawIntention: "${value}" uses uniform draw`);
  }
  return key;
}

export function isValidSessionIntention(value: string): boolean {
  if (isSessionTopicId(value) || value === "life_death" || value === "custom") return true;
  const legacy = [
    "Любовь",
    "Деньги",
    "Здоровье",
    "Мой путь",
    "Враги",
    "Знак свыше",
  ];
  return legacy.includes(value);
}

export function toSessionTopicId(
  value: SessionIntention | SessionTopicId | string
): SessionTopicId | null {
  if (isSessionTopicId(value)) return value;
  if (value === "life_death" || value === "custom") return value;
  const mapped = LEGACY_TO_TOPIC[value as SessionIntention];
  return mapped ?? null;
}
