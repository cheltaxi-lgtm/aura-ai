import type { SessionTopicId } from "@/lib/session-topics";
import { isSessionTopicId } from "@/lib/session-topics";
import { INTENTION_OPTIONS, type SessionIntention } from "@/lib/intention";

type TopicKey = SessionTopicId;

const LEGACY_TO_TOPIC: Partial<Record<SessionIntention, TopicKey>> = {
  Любовь: "love",
  Деньги: "money",
  Здоровье: "health",
  "Мой путь": "path",
  Враги: "enemies",
  "Знак свыше": "sign",
};

export const TOPIC_SUBTITLES: Record<string, Partial<Record<TopicKey, string>>> = {
  agafya: {
    love: "Баба Агафья ведёт разговор через призму: сердце, союз, отношения",
    health: "Баба Агафья смотрит: тело, хвори, родовые корни",
    money: "Баба Агафья глядит: достаток, труд, удача в делах",
    path: "Баба Агафья читает: путь, выбор, судьба",
    enemies: "Баба Агафья видит: недруги, порча, защита",
    sign: "Баба Агафья слушает: знаки, предупреждения свыше",
    life_death: "Баба Агафья смотрит: жив ли, где есть, вернётся ли",
  },
  ragnar: {
    love: "Рагнар читает руны: союз, притяжение, испытания",
    health: "Рагнар смотрит руны: сила тела, дух, восстановление",
    money: "Рагнар раскидывает: богатство, поход, добыча",
    path: "Рагнар вопрошает Норн: путь, Wyrd, предназначение",
    enemies: "Рагнар читает: враги, защита, победа",
    sign: "Рагнар слушает: знаки богов, предупреждения",
    life_death: "Рагнар вопрошает руны: жив ли, где находится, вернётся ли",
  },
  veronika: {
    love: "Вероника раскладывает карты: чувства, связь, перспектива",
    health: "Вероника смотрит: тело, энергия, восстановление",
    money: "Вероника читает: финансы, карьера, решения",
    path: "Вероника раскладывает: путь, выборы, исход",
    enemies: "Вероника видит: скрытые силы, защита, противодействие",
    sign: "Вероника читает знаки: послания, предупреждения",
    life_death: "Вероника смотрит карты: жив ли, состояние, вектор",
  },
  "shri-raj": {
    love: "Гуру читает Джйотиш: карма, союз, Венера",
    health: "Гуру смотрит: прана, баланс, исцеление",
    money: "Гуру читает: Лакшми, дхарма, процветание",
    path: "Гуру вопрошает: дхарма, карма, путь Атмы",
    enemies: "Гуру видит: кармические враги, защита, преодоление",
    sign: "Гуру слышит: послания Вселенной, знаки",
    life_death: "Гуру читает: прана жива ли, Атма где, вернётся ли",
  },
  numerolog: {
    love: "Эвелина считает: числа союза, совместимость, цикл пары",
    health: "Эвелина смотрит: число энергии, ритм восстановления",
    money: "Эвелина читает: восьмёрка, четвёрка, денежный цикл",
    path: "Эвелина считает: число пути, зрелость, предназначение",
    enemies: "Эвелина видит: конфликтные числа, защита периода",
    sign: "Эвелина слушает: знаки в личном дне и месяце",
    life_death: "Эвелина считает: цикл завершения, кармический урок",
  },
};

function resolveTopicKey(intention: string): TopicKey | null {
  if (isSessionTopicId(intention)) return intention;
  if (intention === "life_death") return "life_death";
  return LEGACY_TO_TOPIC[intention as SessionIntention] ?? null;
}

export function getTopicSubtitle(masterId: string, intention: string): string | null {
  const topicKey = resolveTopicKey(intention);
  if (!topicKey) return null;
  return TOPIC_SUBTITLES[masterId]?.[topicKey] ?? null;
}
