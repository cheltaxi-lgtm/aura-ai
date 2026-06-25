import {
  getSessionTopic,
  isSessionTopicId,
  topicLabel,
  type SessionTopicId,
} from "@/lib/session-topics";
export type SessionIntention =
  | "Любовь"
  | "Деньги"
  | "Здоровье"
  | "Мой путь"
  | "Враги"
  | "Знак свыше";

export type { SessionTopicId };
export { SESSION_TOPICS, isSessionTopicId, topicLabel, topicToDrawKey } from "@/lib/session-topics";

export const INTENTION_OPTIONS: {
  id: SessionIntention;
  icon: string;
  label: string;
  focus: string;
}[] = [
  { id: "Любовь", icon: "❤️", label: "Любовь", focus: "сердце, союз, отношения" },
  { id: "Деньги", icon: "💰", label: "Деньги", focus: "ресурс, работа, стабильность" },
  { id: "Здоровье", icon: "🌿", label: "Здоровье", focus: "тело, силы, восстановление" },
  { id: "Мой путь", icon: "🔮", label: "Мой путь", focus: "предназначение, выбор, направление" },
  { id: "Враги", icon: "⚔️", label: "Враги", focus: "конфликт, защита, стратегия" },
  { id: "Знак свыше", icon: "✨", label: "Знак свыше", focus: "знамение, смысл, послание" },
];

export function getIntentionMeta(intention: SessionIntention) {
  return INTENTION_OPTIONS.find((o) => o.id === intention)!;
}

const MASTER_INTENTION_OPENINGS: Record<string, Record<SessionIntention, string>> = {
  ragnar: {
    Любовь:
      "Тема — любовь. Руны и расклад перестроены на сердце и союз. Смотрю символы через это — говори, {name}.",
    Деньги:
      "Тема — деньги. Fehu и расклад смотрят на ресурс и утечки. Начинаю читать через призму достатка — говори, {name}.",
    Здоровье:
      "Тема — здоровье. Тело и руны на одном столе. Читаю расклад на силу и слабость — говори, {name}.",
    "Мой путь":
      "Тема — твой путь. Raido и расклад покажут куда ведёт курс. Настроился — говори, {name}.",
    Враги:
      "Тема — враги и конфликт. Thurisaz смотрит на угрозы. Расклад открыт на защиту — говори, {name}.",
    "Знак свыше":
      "Тема — знак свыше. Ansuz и символы расклада — ищу послание. Слушаю — говори, {name}.",
  },
  agafya: {
    Любовь:
      "Пришла с темой любви — хорошо, {name}. Карты на сердце и род. Смотрю расклад на союз — говори.",
    Деньги:
      "Деньги — вижу, {name}. Расклад на хлеб и утечку. Настроилась на достаток — говори.",
    Здоровье:
      "Здоровье — тяжёлая тема, {name}. Смотрю символы на тело и корень. Говори что беспокоит.",
    "Мой путь":
      "Путь души — {name}. Три свечи и карты смотрят на дорогу. Слушаю — говори.",
    Враги:
      "Враги и наговоры — {name}. Расклад на чужую руку и защиту. Говори прямо.",
    "Знак свыше":
      "Знак свыше — {name}. Символы расклада ищу знамение. Прислушалась — говори.",
  },
  veronika: {
    Любовь:
      "Любовь — карты уже смотрят на кубки и сердце, {name}. Расклад перестроен на эту тему. Говори.",
    Деньги:
      "Деньги — пентакли в раскладе на столе, {name}. Читаю ресурс и страх. Начинай.",
    Здоровье:
      "Здоровье — тело в символах, {name}. Карты на усталость и восстановление. Говори.",
    "Мой путь":
      "Твой путь — {name}. Старшие арканы и расклад смотрят на направление. Я здесь — говори.",
    Враги:
      "Конфликт — мечи в раскладе, {name}. Карты на правду и защиту. Говори без страха.",
    "Знак свыше":
      "Знак свыше — {name}. Звезда и расклад ищут послание. Карты открыты — говори.",
  },
  "shri-raj": {
    Любовь:
      "Тема — любовь, {name}. Седьмой дом и символы расклада — настраиваю чтение. Спрашивай.",
    Деньги:
      "Тема — деньги, {name}. Второй дом и карты на столе. Джйотиш смотрит на ресурс — спрашивай.",
    Здоровье:
      "Тема — здоровье, {name}. Шестой дом и символы расклада. Читаю тело и карму — спрашивай.",
    "Мой путь":
      "Тема — путь души, {name}. Девятый дом и расклад на dharma. Настроился — спрашивай.",
    Враги:
      "Тема — враги, {name}. Шестой дом и Shatru в символах. Стратегия через карты — спрашивай.",
    "Знак свыше":
      "Тема — знак свыше, {name}. Guru и символы расклада ищут послание. Спрашивай.",
  },
};

const MASTER_TOPIC_OPENINGS: Record<string, Partial<Record<SessionTopicId, string>>> = {
  ragnar: {
    life_death:
      "Руны лежат передо мной. Скажи мне — о ком спрашиваешь, и когда последний раз было слово от него.",
  },
  agafya: {
    life_death:
      "Вижу тревогу твою. Скажи мне — о ком душа болит, и сколько дней молчание.",
  },
  veronika: {
    life_death:
      "Карты уже открыты. Прежде чем я начну — скажи о ком речь и когда последний раз была весть.",
  },
  "shri-raj": {
    life_death:
      "Прежде чем читать символы — скажи имя и когда последнее известие пришло.",
  },
};

const TOPIC_ID_TO_LEGACY: Record<SessionTopicId, SessionIntention> = {
  love: "Любовь",
  money: "Деньги",
  health: "Здоровье",
  path: "Мой путь",
  enemies: "Враги",
  sign: "Знак свыше",
  life_death: "Враги",
};

export function buildIntentionOpening(
  masterId: string,
  intention: SessionIntention | SessionTopicId | string,
  userName?: string
): string {
  const name = userName?.trim() || "друг";

  if (isSessionTopicId(intention)) {
    const topicOpening = MASTER_TOPIC_OPENINGS[masterId]?.[intention];
    if (topicOpening) {
      return topicOpening.replace(/\{name\}/g, name);
    }
    const legacy = TOPIC_ID_TO_LEGACY[intention];
    if (legacy) intention = legacy;
  }

  const bank =
    MASTER_INTENTION_OPENINGS[masterId] ?? MASTER_INTENTION_OPENINGS.veronika;
  const template = bank[intention as SessionIntention];
  if (!template) return "";
  return template.replace(/\{name\}/g, name);
}

const THEMATIC_TOPIC_ANGLES: Record<string, string> = {
  love: `УГЛЫ ТЕМЫ «ЛЮБОВЬ И ОТНОШЕНИЯ» — раскрой в каждой карте:
- Карта 1: прошлый паттерн в любви — рана, привычка, урок, который тянется в текущий союз.
- Карта 2: что между людьми СЕЙЧАС — дистанция, правда/скрытность, чувства, инициатива.
- Карта 3: куда идёт связь в ближайшие 1–3 месяца — усиление, пауза, разрыв или новый этап.
Запрещено: «энергия любви», «сердце открыто» без названия карты и конкретного вывода.`,
  money: `УГЛЫ ТЕМЫ «ДЕНЬГИ И КАРЬЕРА»:
- Карта 1: откуда привычка или блок с деньгами — страх, род, прошлый провал, зависимость.
- Карта 2: текущий поток — приход, утечка, стагнация, скрытый источник или риск.
- Карта 3: вектор дохода/работы — рост, смена, задержка, условие для прорыва.
Называй конкретно: работа, долг, сделка, начальник, свой проект — только если карта это показывает.`,
  health: `УГЛЫ ТЕМЫ «ЗДОРОВЬЕ И ЭНЕРГИЯ»:
- Карта 1: корень истощения или силы — накопленное напряжение, привычка, старый удар по телу.
- Карта 2: состояние СЕЙЧАС — где тело сигналит, что держит, что ослабло.
- Карта 3: восстановление или риск — что поможет, что усугубит, темп изменений.
Не ставь диагноз — называй зону (сон, нервы, спина, гормональный фон) только по символу.`,
  path: `УГЛЫ ТЕМЫ «МОЙ ПУТЬ / ПРЕДНАЗНАЧЕНИЕ»:
- Карта 1: что из прошлого опыта ведёт к текущему выбору.
- Карта 2: развилка СЕЙЧАС — честный взгляд на то, куда человек реально идёт, не куда мечтает.
- Карта 3: направление на 3–6 месяцев — призвание, переезд, смена роли, внутренний поворот.
Каждый вывод — через символ, не через общие слова о «предназначении».`,
  enemies: `УГЛЫ ТЕМЫ «ВРАГИ И ЗАЩИТА»:
- Карта 1: источник конфликта или угрозы — кто/что, скрытое или явное (только по символу).
- Карта 2: расстановка СЕЙЧАС — сила сторон, ловушка, твоя позиция.
- Карта 3: исход стратегии — отступ, удар, мир, ожидание; что усилит защиту.
Если врага в символах нет — скажи: «в раскладе чужой атаки не видно».`,
  sign: `УГЛЫ ТЕМЫ «ЗНАК СВЫХЕ / ПОСЛАНИЕ»:
- Карта 1: что уже было знамением — событие, сон, повтор, которое человек мог не заметить.
- Карта 2: послание СЕЙЧАС — что вселенная/судьба показывает прямо в этот период.
- Карта 3: как применить знак — одно действие или одно изменение взгляда.
Не выдумывай «знак», если символы нейтральны — скажи честно.`,
};

function resolveThematicTopicAngles(intention: string): string {
  const topic = getSessionTopic(intention);
  const key = topic?.id ?? intention;
  return THEMATIC_TOPIC_ANGLES[key] ?? "";
}

function resolveThematicMeta(intention: string) {
  const topicMeta = getSessionTopic(intention);
  const label = topicMeta?.label ?? intention;
  const focus =
    topicMeta?.focus ??
    INTENTION_OPTIONS.find((o) => o.id === intention)?.focus ??
    intention;
  return { label, focus };
}

export function intentionPromptBlock(intention?: string | null): string {
  if (!intention?.trim()) return "";
  if (intention === "life_death") return "";

  const { label, focus } = resolveThematicMeta(intention);
  const angles = resolveThematicTopicAngles(intention);

  return `\nКлиент пришёл с намерением: ${label} (${focus}).
Это рамка сеанса — не доказательство фактов.
В ответе: назови тему один раз, дальше — только конкретика по символам.
${angles ? `${angles}\n` : ""}Любой вывод — только если его поддерживают выпавшие символы, с названием карты.
Если символы не подтверждают страх по этой теме — скажи прямо.`;
}

export function intentionSpreadPromptBlock(intention: string): string {
  if (intention === "life_death") return "";

  const { label, focus } = resolveThematicMeta(intention);
  const angles = resolveThematicTopicAngles(intention);

  return `\nКлиент ОПЛАТИЛ новый расклад под тему «${label}» (${focus}).
Читай КАЖДЫЙ символ только через эту тему — но выводы только из значений выпавших карт, не из темы.
${angles ? `\n${angles}\n` : ""}`;
}

/** Подробный тематический блок для /api/reading при активной теме сеанса. */
export function intentionReadingPromptBlock(intention: string): string {
  if (intention === "life_death") return "";
  return intentionSpreadPromptBlock(intention);
}

/** @deprecated use buildIntentionOpening */
export function greetingForMaster(masterId: string, intention?: SessionIntention | null): string | null {
  if (!intention) return null;
  return buildIntentionOpening(masterId, intention);
}

/** @deprecated legacy global key — do not use for reads */
export const SESSION_INTENTION_KEY = "aura_session_intention";

export function sessionIntentionStorageKey(characterKey: string): string {
  return `aura_session_intention_${characterKey}`;
}

export function intentionSpreadStorageKey(characterKey: string): string {
  return `aura_intention_spread_${characterKey}`;
}

export function persistSessionIntention(
  characterKey: string,
  intention: SessionIntention | SessionTopicId | null
) {
  if (typeof window === "undefined" || !characterKey) return;
  const key = sessionIntentionStorageKey(characterKey);
  if (intention) localStorage.setItem(key, intention);
  else localStorage.removeItem(key);
  // legacy global key caused cross-master leaks
  localStorage.removeItem(SESSION_INTENTION_KEY);
}

export function readSessionIntention(
  characterKey: string
): SessionIntention | SessionTopicId | null {
  if (typeof window === "undefined" || !characterKey) return null;
  const raw = localStorage.getItem(sessionIntentionStorageKey(characterKey));
  if (!raw) return null;
  if (isSessionTopicId(raw)) return raw;
  return INTENTION_OPTIONS.some((o) => o.id === raw) ? (raw as SessionIntention) : null;
}

const INTENTION_SPREAD_LEGACY_KEY = "aura_intention_spread";

export type PersistedIntentionSpread = {
  masterId: string;
  cardsKey: string;
  cards: { id?: number; name: string; meaning?: string }[];
  system: import("@/lib/decks/types").DeckSystem;
  intention: SessionIntention | SessionTopicId;
};

export function persistIntentionSpreadState(
  characterKey: string,
  state: Omit<PersistedIntentionSpread, "masterId"> | null
): void {
  if (typeof window === "undefined" || !characterKey) return;
  const key = intentionSpreadStorageKey(characterKey);
  if (!state) {
    localStorage.removeItem(key);
    localStorage.removeItem(INTENTION_SPREAD_LEGACY_KEY);
    return;
  }
  localStorage.setItem(
    key,
    JSON.stringify({ ...state, masterId: characterKey } satisfies PersistedIntentionSpread)
  );
}

export function readIntentionSpreadState(
  masterId: string,
  cardsKey?: string
): PersistedIntentionSpread | null {
  if (typeof window === "undefined" || !masterId) return null;
  try {
    const raw = localStorage.getItem(intentionSpreadStorageKey(masterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedIntentionSpread;
    if (parsed.masterId !== masterId) return null;
    if (cardsKey && parsed.cardsKey !== cardsKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Latest intention spread for master — ignores triplet cardsKey mismatch. */
export function readIntentionSpreadForMaster(
  masterId: string
): PersistedIntentionSpread | null {
  if (typeof window === "undefined" || !masterId) return null;
  try {
    const raw = localStorage.getItem(intentionSpreadStorageKey(masterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedIntentionSpread;
    if (parsed.masterId !== masterId || !parsed.cards?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}
