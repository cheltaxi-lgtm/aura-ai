import {
  getSessionTopic,
  isSessionTopicId,
  topicLabel,
  type SessionTopicId,
} from "@/lib/session-topics";
import { customQuestionSpreadRules, isThirdPartyCustomQuestion } from "@/lib/custom-question-scope";
import { resolveSpreadPositions, type SpreadId } from "@/lib/spreads";

export type IntentionPromptOptions = {
  cardCount?: number;
  positionLabels?: string[];
  spreadId?: SpreadId | string | null;
  /** Free-form user question (intention === "custom"). */
  customQuestion?: string | null;
};
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

const TOPIC_ID_TO_LEGACY: Record<Exclude<SessionTopicId, "custom">, SessionIntention> = {
  love: "Любовь",
  money: "Деньги",
  health: "Здоровье",
  path: "Мой путь",
  enemies: "Враги",
  sign: "Знак свыше",
  // life_death has dedicated MASTER_TOPIC_OPENINGS — never fall back to «Враги».
  life_death: "Любовь",
};

export function buildIntentionOpening(
  masterId: string,
  intention: SessionIntention | SessionTopicId | string,
  userName?: string
): string {
  const name = userName?.trim() || "друг";

  if (isSessionTopicId(intention)) {
    if (intention === "custom") return "";
    const topicOpening =
      MASTER_TOPIC_OPENINGS[masterId]?.[intention] ??
      MASTER_TOPIC_OPENINGS.veronika?.[intention];
    if (topicOpening) {
      return topicOpening.replace(/\{name\}/g, name);
    }
    if (intention === "life_death") {
      return "Прежде чем читать символы — скажи, о ком речь и когда последний раз была весть.".replace(
        /\{name\}/g,
        name
      );
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

/** Topic lenses applied per position (past / now / future-or-outcome). */
const TOPIC_LENS: Record<
  string,
  { title: string; past: string; now: string; future: string; ban: string }
> = {
  love: {
    title: "ЛЮБОВЬ И ОТНОШЕНИЯ",
    past: "прошлый паттерн в любви — рана, привычка, урок, который тянется в текущий союз",
    now: "что между людьми СЕЙЧАС — дистанция, правда/скрытность, чувства, инициатива",
    future: "куда идёт связь — усиление, пауза, разрыв или новый этап (только по символу)",
    ban: "Запрещено: «энергия любви», «сердце открыто» без названия карты и конкретного вывода.",
  },
  money: {
    title: "ДЕНЬГИ И КАРЬЕРА",
    past: "откуда привычка или блок с деньгами — страх, род, прошлый провал, зависимость",
    now: "текущий поток — приход, утечка, стагнация, скрытый источник или риск",
    future: "вектор дохода/работы — рост, смена, задержка, условие для прорыва",
    ban: "Называй конкретно: работа, долг, сделка, начальник, свой проект — только если карта это показывает.",
  },
  health: {
    title: "ЗДОРОВЬЕ И ЭНЕРГИЯ",
    past: "корень истощения или силы — накопленное напряжение, привычка, старый удар по телу",
    now: "состояние СЕЙЧАС — где тело сигналит, что держит, что ослабло",
    future: "восстановление или риск — что поможет, что усугубит, темп изменений",
    ban: "Не ставь диагноз — называй зону (сон, нервы, спина) только по символу.",
  },
  path: {
    title: "МОЙ ПУТЬ / ПРЕДНАЗНАЧЕНИЕ",
    past: "что из прошлого опыта ведёт к текущему выбору",
    now: "развилка СЕЙЧАС — куда человек реально идёт, не куда мечтает",
    future: "направление — призвание, переезд, смена роли, внутренний поворот",
    ban: "Каждый вывод — через символ, не через общие слова о «предназначении».",
  },
  enemies: {
    title: "ВРАГИ И ЗАЩИТА",
    past: "источник конфликта или угрозы — кто/что, скрытое или явное (только по символу)",
    now: "расстановка СЕЙЧАС — сила сторон, ловушка, твоя позиция",
    future: "исход стратегии — отступ, удар, мир, ожидание; что усилит защиту",
    ban: "Если врага в символах нет — скажи: «в раскладе чужой атаки не видно».",
  },
  sign: {
    title: "ЗНАК СВЫХЕ / ПОСЛАНИЕ",
    past: "что уже было знамением — событие, сон, повтор, которое человек мог не заметить",
    now: "послание СЕЙЧАС — что показывает прямо в этот период",
    future: "как применить знак — одно действие или одно изменение взгляда",
    ban: "Не выдумывай «знак», если символы нейтральны — скажи честно.",
  },
};

function topicKeyFromIntention(intention: string): string {
  const topic = getSessionTopic(intention);
  return topic?.id ?? intention;
}

function lensForSlot(
  lens: (typeof TOPIC_LENS)[string],
  index: number,
  total: number
): string {
  if (total <= 1) return lens.now;
  if (index === 0) return lens.past;
  if (index === total - 1) return lens.future;
  const mid = Math.floor((total - 1) / 2);
  if (index <= mid) return lens.now;
  return lens.future;
}

export function resolveThematicTopicAngles(
  intention: string,
  options?: IntentionPromptOptions
): string {
  const key = topicKeyFromIntention(intention);
  const lens = TOPIC_LENS[key];
  if (!lens) return "";

  const sessionTopic = isSessionTopicId(key) ? key : null;
  const positions =
    options?.positionLabels?.length
      ? options.positionLabels
      : options?.spreadId
        ? resolveSpreadPositions(options.spreadId, sessionTopic).map((p) => p.label)
        : [];
  const n = Math.max(1, options?.cardCount ?? (positions.length || 3));
  const labels =
    positions.length >= n
      ? positions.slice(0, n)
      : Array.from({ length: n }, (_, i) => positions[i] ?? `Позиция ${i + 1}`);

  const lines = labels.map((label, i) => {
    const angle = lensForSlot(lens, i, n);
    return `- «${label}»: ${angle}`;
  });

  return `УГЛЫ ТЕМЫ «${lens.title}» — раскрой КАЖДУЮ из ${n} позиций через тему (название символа обязательно):
${lines.join("\n")}
${lens.ban}`;
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

export function intentionPromptBlock(
  intention?: string | null,
  customQuestion?: string | null,
  options?: IntentionPromptOptions
): string {
  if (!intention?.trim()) return "";
  if (intention === "life_death") return "";
  if (intention === "custom") {
    const q = customQuestion?.trim();
    if (!q) return "";
    const n = options?.cardCount ?? options?.positionLabels?.length ?? 0;
    const nRule =
      n > 0
        ? `\nРаскрой все ${n} позиций расклада через этот вопрос — с названием каждого символа.`
        : "";
    return `\nКлиент пришёл со своим вопросом: «${q}».
Отвечай только на этот запрос — через выпавшие символы, с названием каждой карты.
Не подменяй вопрос общей темой и не выдумывай факты вне символов.${nRule}
${customQuestionSpreadRules(q)}`;
  }

  const { label, focus } = resolveThematicMeta(intention);
  const angles = resolveThematicTopicAngles(intention, options);

  return `\nКлиент пришёл с намерением: ${label} (${focus}).
Это рамка сеанса — не доказательство фактов.
В ответе: назови тему один раз, дальше — только конкретика по символам.
${angles ? `${angles}\n` : ""}Любой вывод — только если его поддерживают выпавшие символы, с названием карты.
Если символы не подтверждают страх по этой теме — скажи прямо.`;
}

export function intentionSpreadPromptBlock(
  intention: string,
  customQuestion?: string | null,
  options?: IntentionPromptOptions
): string {
  if (intention === "life_death") return "";
  if (intention === "custom") {
    const q = customQuestion?.trim();
    if (!q) return "";
    const n = options?.cardCount ?? options?.positionLabels?.length ?? 0;
    const nRule =
      n > 0
        ? `\nОбязательно раскрой все ${n} позиций — каждую по имени символа как ответ на вопрос.`
        : "";
    return `\nКлиент ОПЛАТИЛ новый расклад под свой вопрос: «${q}».
Читай КАЖДЫЙ символ как ответ именно на этот вопрос — выводы только из значений выпавших карт.${nRule}
${customQuestionSpreadRules(q)}`;
  }

  const { label, focus } = resolveThematicMeta(intention);
  const angles = resolveThematicTopicAngles(intention, options);

  return `\nКлиент ОПЛАТИЛ новый расклад под тему «${label}» (${focus}).
Читай КАЖДЫЙ символ только через эту тему — но выводы только из значений выпавших карт, не из темы.
${angles ? `\n${angles}\n` : ""}`;
}

/** Подробный тематический блок для /api/reading при активной теме сеанса. */
export function intentionReadingPromptBlock(
  intention: string,
  options?: IntentionPromptOptions
): string {
  if (intention === "life_death") return "";
  return intentionSpreadPromptBlock(intention, options?.customQuestion ?? null, options);
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

export function sessionCustomQuestionStorageKey(characterKey: string): string {
  return `aura_session_custom_question_${characterKey}`;
}

export function persistSessionCustomQuestion(characterKey: string, question: string | null): void {
  if (typeof window === "undefined" || !characterKey) return;
  const key = sessionCustomQuestionStorageKey(characterKey);
  const trimmed = question?.trim();
  if (trimmed) localStorage.setItem(key, trimmed);
  else localStorage.removeItem(key);
}

export function readSessionCustomQuestion(characterKey: string): string | null {
  if (typeof window === "undefined" || !characterKey) return null;
  const raw = localStorage.getItem(sessionCustomQuestionStorageKey(characterKey));
  return raw?.trim() || null;
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
  if (intention !== "custom") {
    persistSessionCustomQuestion(characterKey, null);
  }
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
