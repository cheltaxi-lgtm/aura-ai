import { TRIPLET_POSITIONS } from "@/lib/tarot";
import type { DeckSystem } from "@/lib/decks/types";
import type { SessionTopicId } from "@/lib/session-topics";
import {
  DEFAULT_SPREAD_CATALOG_SETTINGS,
  type SpreadCatalogSettings,
  type SpreadDefinition,
  type SpreadId,
  type SpreadPosition,
  type SpreadSettingsOverride,
} from "./types";

const tripletPositions: SpreadPosition[] = TRIPLET_POSITIONS.map((label, i) => ({
  key: `p${i + 1}`,
  label,
}));

const tripletLovePositions: SpreadPosition[] = [
  { key: "you", label: "Вы" },
  { key: "partner", label: "Партнёр" },
  { key: "outlook", label: "Перспектива" },
];

const situation5Positions: SpreadPosition[] = [
  { key: "situation", label: "Ситуация" },
  { key: "obstacle", label: "Препятствие" },
  { key: "root", label: "Корень" },
  { key: "advice", label: "Совет" },
  { key: "outcome", label: "Итог" },
];

const love7Positions: SpreadPosition[] = [
  { key: "you", label: "Вы" },
  { key: "partner", label: "Партнёр" },
  { key: "bond", label: "Связь между вами" },
  { key: "strength", label: "Сила пары" },
  { key: "weakness", label: "Слабое место" },
  { key: "advice", label: "Совет" },
  { key: "outcome", label: "Итог" },
];

const celticCrossPositions: SpreadPosition[] = [
  { key: "present", label: "Настоящее" },
  { key: "challenge", label: "Вызов" },
  { key: "past", label: "Прошлое" },
  { key: "future", label: "Будущее" },
  { key: "above", label: "Сознание" },
  { key: "below", label: "Подсознание" },
  { key: "advice", label: "Совет" },
  { key: "environment", label: "Окружение" },
  { key: "hopes", label: "Надежды и страхи" },
  { key: "outcome", label: "Итог" },
];

const yearAheadPositions: SpreadPosition[] = [
  { key: "jan", label: "Январь" },
  { key: "feb", label: "Февраль" },
  { key: "mar", label: "Март" },
  { key: "apr", label: "Апрель" },
  { key: "may", label: "Май" },
  { key: "jun", label: "Июнь" },
  { key: "jul", label: "Июль" },
  { key: "aug", label: "Август" },
  { key: "sep", label: "Сентябрь" },
  { key: "oct", label: "Октябрь" },
  { key: "nov", label: "Ноябрь" },
  { key: "dec", label: "Декабрь" },
  { key: "outcome", label: "Итог года" },
];

const compatibility12Positions: SpreadPosition[] = [
  { key: "you-core", label: "Вы — суть" },
  { key: "you-feelings", label: "Вы — чувства" },
  { key: "you-goals", label: "Вы — цели" },
  { key: "partner-core", label: "Партнёр — суть" },
  { key: "partner-feelings", label: "Партнёр — чувства" },
  { key: "partner-goals", label: "Партнёр — цели" },
  { key: "bond", label: "Связь" },
  { key: "attraction", label: "Притяжение" },
  { key: "emotion", label: "Эмоции пары" },
  { key: "challenge", label: "Препятствие" },
  { key: "advice", label: "Совет" },
  { key: "outcome", label: "Итог пары" },
];

const lenormandLinePositions: SpreadPosition[] = [
  { key: "base", label: "Основа" },
  { key: "development", label: "Развитие" },
  { key: "core", label: "Ядро" },
  { key: "outcome", label: "Исход" },
  { key: "key", label: "Ключ" },
];

export const SPREAD_REGISTRY: Record<SpreadId, SpreadDefinition> = {
  triplet: {
    id: "triplet",
    label: "Три карты",
    description: "Прошлое, настоящее и будущее — классический расклад Таро на три карты",
    cardCount: 3,
    positions: tripletPositions,
    topics: "*",
    systems: "*",
    costMultiplier: 1.0,
    layout: "row",
    seoSlug: "triplet",
    seo: {
      title: "Таро на три карты: расклад онлайн | Zovus",
      h1: "Таро на три карты — прошлое, настоящее, будущее",
      intro:
        "Расклад Таро на три карты — самая узнаваемая схема гадания: три позиции показывают динамику вопроса (прошлое, настоящее, будущее или ситуацию, действие и итог) без перегруза деталями.",
    },
  },
  single: {
    id: "single",
    label: "Одна карта",
    description: "Быстрый ответ или послание дня — таро одна карта без долгих раскладов",
    cardCount: 1,
    positions: [{ key: "message", label: "Послание" }],
    topics: "*",
    systems: "*",
    costMultiplier: 0.5,
    layout: "row",
    seoSlug: "odna-karta",
    seo: {
      title: "Таро одна карта: быстрый расклад и значение | Zovus",
      h1: "Таро одна карта — быстрый расклад на один вопрос",
      intro:
        "Расклад «Таро одна карта» — классический способ гадания, когда нужен ответ здесь и сейчас: одна карта Таро раскрывает суть ситуации или даёт послание дня без долгих многокарточных схем.",
      extra: {
        heading: "Когда достаточно одной карты",
        body: [
          "Одна карта хорошо подходит для утренней практики, короткого совета перед решением или когда вопрос узкий и конкретный — «на что обратить внимание сегодня» или «как пройдёт встреча».",
          "Если вопрос требует причины и следствия или сравнения вариантов, лучше взять расклад на три карты или «Да / Нет» — их можно выбрать в каталоге раскладов.",
        ],
      },
    },
  },
  "situation-5": {
    id: "situation-5",
    label: "Расклад на ситуацию",
    description: "Пять карт: суть, препятствие, корень, совет и итог",
    cardCount: 5,
    positions: situation5Positions,
    topics: "*",
    systems: "*",
    costMultiplier: 1.5,
    layout: "cross5",
    compactPrompt: true,
    seoSlug: "na-5-kart",
    seo: {
      title: "Таро на 5 карт: расклад на ситуацию | Zovus",
      h1: "Таро на 5 карт — расклад на ситуацию",
      intro:
        "Расклад Таро на пять карт разбирает вопрос по слоям: суть ситуации, скрытое препятствие, его корень, совет мастера и вероятный итог — подходит, когда одной или трёх карт не хватает для полноты ответа.",
    },
  },
  "triplet-love": {
    id: "triplet-love",
    label: "Любовный триплет",
    description: "Вы, партнёр и перспектива отношений — расклад Таро на любовь",
    cardCount: 3,
    positions: tripletLovePositions,
    topics: ["love"],
    systems: "*",
    costMultiplier: 1.0,
    layout: "row",
    seoSlug: "lyubovnyj-triplet",
    seo: {
      title: "Таро на любовь: любовный триплет онлайн | Zovus",
      h1: "Таро на любовь — расклад «Вы, партнёр, перспектива»",
      intro:
        "Расклад Таро на любовь в три позиции показывает ваше состояние, состояние партнёра и куда движутся отношения — быстрый способ увидеть перспективу пары без десяти карт Кельтского креста.",
    },
  },
  "love-7": {
    id: "love-7",
    label: "Волшебная любовь",
    description: "Глубокий расклад Таро на отношения и любовь — семь позиций",
    cardCount: 7,
    positions: love7Positions,
    topics: ["love"],
    systems: "*",
    costMultiplier: 2.0,
    layout: "grid7",
    compactPrompt: true,
    seoSlug: "na-lyubov",
    seo: {
      title: "Таро на любовь: глубокий расклад на отношения | Zovus",
      h1: "Таро на любовь — глубокий расклад на отношения",
      intro:
        "Расклад Таро на любовь «Волшебная любовь» разбирает пару по семи позициям: чувства и связь двоих, силу и слабое место отношений, совет и вероятный итог — для тех, кому нужна не быстрая, а подробная картина.",
    },
  },
  "yes-no": {
    id: "yes-no",
    label: "Да / Нет",
    description: "Таро да нет — прямой ответ на вопрос по одной карте",
    cardCount: 1,
    positions: [{ key: "answer", label: "Ответ" }],
    topics: "*",
    systems: ["tarot-veronika", "tarot-marina"],
    costMultiplier: 0.5,
    layout: "row",
    seoSlug: "da-net",
    seo: {
      title: "Таро да нет: точный расклад онлайн | Zovus",
      h1: "Таро да нет — точный ответ на ваш вопрос",
      intro:
        "Расклад «Таро да нет» — самый быстрый способ гадания на картах Таро: вы формулируете один чёткий вопрос, вытягиваете одну карту, и мастер переводит её значение в понятный ответ «да» или «нет» с пояснением нюансов и оговорок.",
      extra: {
        heading: "Как карты Таро отвечают «да» или «нет»",
        body: [
          "Светлые арканы — Солнце, Звезда, Маг, Мир, Колесо Фортуны в прямом положении — чаще читаются как «да». Башня, Луна, Дьявол, перевёрнутые карты — как «нет» или «не сейчас».",
          "Многие карты неоднозначны и зависят от вопроса и позиции (прямая или перевёрнутая) — поэтому мастер учитывает контекст, а не только формальное «да/нет» по таблице соответствий.",
          "Если ответ получился спорным или вопрос оказался шире, чем «да/нет», уточните его в расширенном раскладе на три карты или «Кельтский крест».",
        ],
      },
    },
  },
  "runes-yes-no": {
    id: "runes-yes-no",
    label: "Руны да / нет",
    description: "Гадание на рунах да или нет — прямой ответ по одной руне",
    cardCount: 1,
    positions: [{ key: "answer", label: "Ответ" }],
    topics: "*",
    systems: ["runes"],
    costMultiplier: 0.5,
    layout: "row",
    seoSlug: "runy-da-net",
    seo: {
      title: "Гадание на рунах да или нет онлайн | Zovus",
      h1: "Гадание на рунах да или нет",
      intro:
        "Гадание на рунах «Да или нет» — скандинавский способ получить прямой ответ: вы формулируете один чёткий вопрос, вытягиваете руну, а Рагнар переводит древний символ в понятное «да», «нет» или «не сейчас» с пояснением нюансов.",
      extra: {
        heading: "Как руны отвечают «да» или «нет»",
        body: [
          "Светлые руны — Соулу, Йера, Вуньо, Гебо, Ингуз — чаще читаются как поддержка и «да». Наутиз, Хагалаз, Иса, перевёрнутые (меркстав) руны — как «нет» или сигнал притормозить.",
          "У рун, в отличие от карт Таро, есть двадцать четыре, а не семьдесят восемь символов — ответ более прямой и лаконичный, без множества сюжетных нюансов.",
          "Если вопрос шире, чем «да/нет», или ответ показался спорным, уточните его в раскладе на три карты или обсудите ситуацию с Рагнаром в чате.",
        ],
      },
    },
  },
  "celtic-cross": {
    id: "celtic-cross",
    label: "Кельтский крест",
    description: "Классический глубокий расклад Таро — десять карт",
    cardCount: 10,
    positions: celticCrossPositions,
    topics: "*",
    systems: "*",
    costMultiplier: 2.5,
    layout: "celtic10",
    compactPrompt: true,
    seoSlug: "keltskij-krest",
    seo: {
      title: "Кельтский крест: расклад Таро онлайн на 10 карт | Zovus",
      h1: "Кельтский крест — расклад Таро на 10 карт",
      intro:
        "«Кельтский крест» — самый подробный классический расклад Таро: десять карт разбирают настоящее, скрытый вызов, прошлое и будущее, сознательные и подсознательные мотивы, окружение, надежды и страхи, а также итог ситуации.",
      extra: {
        heading: "Когда нужен именно Кельтский крест",
        body: [
          "Схема подходит для сложных или многослойных вопросов — смены курса в карьере, затяжного конфликта, решения, влияющего на несколько сфер жизни сразу.",
          "Для короткого ответа на конкретный вопрос быстрее подойдёт расклад «Да / Нет» или «Одна карта» — Кельтский крест рассчитан на глубину, а не на скорость.",
        ],
      },
    },
  },
  "daily-extended": {
    id: "daily-extended",
    label: "Расширенный день",
    description: "Семь карт на разные сферы дня",
    cardCount: 7,
    positions: [
      { key: "morning", label: "Утро" },
      { key: "work", label: "Дела" },
      { key: "relations", label: "Отношения" },
      { key: "health", label: "Энергия" },
      { key: "evening", label: "Вечер" },
      { key: "advice", label: "Совет" },
      { key: "message", label: "Послание" },
    ],
    topics: "*",
    systems: "*",
    costMultiplier: 2.0,
    layout: "grid7",
    compactPrompt: true,
    seoSlug: "rasshirennyj-den",
    seo: {
      title: "Таро на день: расширенный расклад на 7 сфер | Zovus",
      h1: "Таро на день — расширенный расклад на 7 сфер",
      intro:
        "Расширенный расклад Таро на день разбирает сутки по семи сферам — утро, дела, отношения, энергию, вечер, совет и главное послание, а не одну общую карту дня.",
    },
  },
  "week-overview": {
    id: "week-overview",
    label: "Расклад на неделю",
    description: "Семь карт Таро — обзор недели по дням и сферам",
    cardCount: 7,
    positions: [
      { key: "week-start", label: "Начало недели" },
      { key: "work", label: "Работа и дела" },
      { key: "relations", label: "Отношения" },
      { key: "energy", label: "Энергия" },
      { key: "turning", label: "Поворот недели" },
      { key: "advice", label: "Совет" },
      { key: "outcome", label: "Итог недели" },
    ],
    topics: "*",
    systems: "*",
    costMultiplier: 2.0,
    layout: "grid7",
    compactPrompt: true,
    seoSlug: "na-nedelyu",
    seo: {
      title: "Таро на неделю: расклад онлайн по дням | Zovus",
      h1: "Таро на неделю — расклад по дням и сферам",
      intro:
        "Расклад Таро на неделю показывает начало недели, работу и дела, отношения, энергию, переломный момент, совет и итог — удобная альтернатива ежедневной карте дня, когда хочется увидеть неделю целиком.",
    },
  },
  "year-ahead": {
    id: "year-ahead",
    label: "Год вперёд",
    description: "Таро на год: двенадцать месяцев и итог года — полный прогноз на 12+1 карту",
    cardCount: 13,
    positions: yearAheadPositions,
    topics: ["path"],
    systems: "*",
    costMultiplier: 3.5,
    layout: "grid12",
    compactPrompt: true,
    seoSlug: "god-vpered",
    seo: {
      title: "Таро на год: расклад на 12 месяцев онлайн | Zovus",
      h1: "Таро на год — расклад на 12 месяцев и итог",
      intro:
        "Расклад Таро на год вперёд разбирает каждый из двенадцати месяцев отдельной картой и завершается общим итогом — подходит для годового планирования, дня рождения или начала нового календарного года.",
    },
  },
  "compatibility-12": {
    id: "compatibility-12",
    label: "Совместимость 12 карт",
    description: "Таро на совместимость: два человека по шести сферам — глубокий разбор пары",
    cardCount: 12,
    positions: compatibility12Positions,
    topics: ["love"],
    systems: "*",
    costMultiplier: 3.0,
    layout: "grid12",
    compactPrompt: true,
    seoSlug: "sovmestimost-12",
    seo: {
      title: "Таро на совместимость: расклад для двоих на 12 карт | Zovus",
      h1: "Таро на совместимость — расклад для пары на 12 карт",
      intro:
        "Расклад Таро на совместимость разбирает пару по шести общим сферам — суть, чувства и цели каждого, связь, притяжение, эмоции пары, препятствие, совет и итог. Это карточный разбор отношений, а не числовой расчёт по датам рождения.",
    },
  },
  "lenormand-line": {
    id: "lenormand-line",
    label: "Линия Ленорман",
    description: "Пять карт в линию — быстрая фраза «основа → исход» в духе оракула Ленорман",
    cardCount: 5,
    positions: lenormandLinePositions,
    topics: "*",
    systems: ["lenormand"],
    costMultiplier: 1.5,
    layout: "row",
    compactPrompt: true,
    seoSlug: "lenormand-liniya",
    seo: {
      title: "Ленорман онлайн: расклад «Линия» на 5 карт | Zovus",
      h1: "Ленорман онлайн — расклад «Линия» на 5 карт",
      intro:
        "Расклад «Линия» на картах оракула Ленорман строит короткую фразу из пяти карт: основа, развитие, ядро вопроса, исход и ключ — более конкретный и прямой стиль ответа, чем у классического Таро.",
    },
  },
};

export const DEFAULT_SPREAD_ID: SpreadId = "triplet";

/** Spreads used only in the daily-reading flow, not in paid intention sessions. */
export function isDailyOnlySpread(id: SpreadId | string | null | undefined): boolean {
  return normalizeSpreadId(id) === "daily-extended";
}

export function normalizeSpreadId(raw?: string | null): SpreadId {
  if (raw && raw in SPREAD_REGISTRY) return raw as SpreadId;
  return DEFAULT_SPREAD_ID;
}

let catalogSettings: SpreadCatalogSettings = { ...DEFAULT_SPREAD_CATALOG_SETTINGS };

export function setSpreadCatalogSettings(settings: Partial<SpreadCatalogSettings>): void {
  catalogSettings = {
    spreadsCatalogEnabled:
      settings.spreadsCatalogEnabled ?? catalogSettings.spreadsCatalogEnabled,
    spreadOverrides: {
      ...catalogSettings.spreadOverrides,
      ...settings.spreadOverrides,
    },
  };
}

export function getSpreadCatalogSettings(): SpreadCatalogSettings {
  return catalogSettings;
}

export function mergeSpreadCatalogSettings(
  raw: Partial<SpreadCatalogSettings> | null | undefined
): SpreadCatalogSettings {
  if (!raw) return { ...DEFAULT_SPREAD_CATALOG_SETTINGS };
  return {
    spreadsCatalogEnabled:
      raw.spreadsCatalogEnabled ?? DEFAULT_SPREAD_CATALOG_SETTINGS.spreadsCatalogEnabled,
    spreadOverrides: {
      ...DEFAULT_SPREAD_CATALOG_SETTINGS.spreadOverrides,
      ...(raw.spreadOverrides ?? {}),
    },
  };
}

function getSpreadOverride(id: SpreadId): SpreadSettingsOverride | undefined {
  return catalogSettings.spreadOverrides[id];
}

function isSpreadExplicitlyDisabled(id: SpreadId): boolean {
  return getSpreadOverride(id)?.enabled === false;
}

/** Master catalog toggle — affects scheme picker UI, not deep-link sessions. */
export function isSpreadCatalogMasterEnabled(): boolean {
  return catalogSettings.spreadsCatalogEnabled;
}

/** Whether a spread can run in paid session / API (deep links included). */
export function isSpreadSessionAllowed(id: SpreadId): boolean {
  return !isSpreadExplicitlyDisabled(id);
}

export function isSpreadEnabled(id: SpreadId): boolean {
  if (!catalogSettings.spreadsCatalogEnabled) {
    return id === DEFAULT_SPREAD_ID;
  }
  return !isSpreadExplicitlyDisabled(id);
}

export function getSpread(id: SpreadId | string | null | undefined): SpreadDefinition {
  const spreadId = normalizeSpreadId(id);
  const base = SPREAD_REGISTRY[spreadId];
  const override = getSpreadOverride(spreadId);
  if (!override?.costMultiplier) return base;
  return { ...base, costMultiplier: override.costMultiplier };
}

export function getSpreadCostMultiplier(id: SpreadId | string | null | undefined): number {
  return getSpread(id).costMultiplier;
}

export function resolveSpreadPositions(
  spreadId: SpreadId | string | null | undefined,
  topic?: SessionTopicId | null
): SpreadPosition[] {
  const spread = getSpread(spreadId);
  if (topic === "love" && spread.id === "triplet") {
    return tripletLovePositions;
  }
  return spread.positions;
}

export function spreadPositionLabels(
  spreadId: SpreadId | string | null | undefined,
  topic?: SessionTopicId | null
): string[] {
  return resolveSpreadPositions(spreadId, topic).map((p) => p.label);
}

export function spreadMatchesTopic(
  spread: SpreadDefinition,
  topic: SessionTopicId
): boolean {
  if (spread.topics === "*") return true;
  return spread.topics.includes(topic);
}

export function spreadMatchesSystem(spread: SpreadDefinition, system: DeckSystem): boolean {
  if (spread.systems === "*") return true;
  return spread.systems.includes(system);
}

export function listSpreads(options?: {
  topic?: SessionTopicId | null;
  system?: DeckSystem;
  includeDisabled?: boolean;
}): SpreadDefinition[] {
  const { topic, system, includeDisabled } = options ?? {};
  return (Object.values(SPREAD_REGISTRY) as SpreadDefinition[]).filter((spread) => {
    if (!includeDisabled && !isSpreadEnabled(spread.id)) return false;
    if (spread.id === "triplet-love" || isDailyOnlySpread(spread.id)) return false;
    if (topic && !spreadMatchesTopic(spread, topic)) return false;
    if (system && !spreadMatchesSystem(spread, system)) return false;
    return true;
  });
}

export function listSpreadsForTopic(
  topic: SessionTopicId,
  system: DeckSystem
): SpreadDefinition[] {
  return listSpreads({ topic, system });
}

export function getSpreadBySeoSlug(slug: string): SpreadDefinition | null {
  const found = (Object.values(SPREAD_REGISTRY) as SpreadDefinition[]).find(
    (s) => s.seoSlug === slug
  );
  return found ?? null;
}

export function requiredCardCount(
  spreadId: SpreadId | string | null | undefined,
  spreadType?: string | null
): number {
  if (spreadType === "daily") return 3;
  if (spreadType === "photo") return 1;
  return getSpread(spreadId).cardCount;
}

export function hasCompleteSpread(
  cards: string[] | null | undefined,
  spreadId?: SpreadId | string | null,
  spreadType?: string | null
): boolean {
  const count = cards?.length ?? 0;
  if (count < 1) return false;
  const required = requiredCardCount(spreadId, spreadType);
  return count >= required;
}

/** Flip state array sized for N-card spreads (replaces hardcoded [true,true,true]). */
export function spreadFlippedState(count: number, flipped = true): boolean[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, () => flipped);
}

export function sliceForSpread<T>(
  items: T[],
  spreadId?: SpreadId | string | null,
  spreadType?: string | null
): T[] {
  if (spreadType === "photo") return items;
  return items.slice(0, requiredCardCount(spreadId, spreadType));
}

/** Max cards in catalog (Celtic cross). Used for keyCards / memory caps. */
export const MAX_SPREAD_CARD_COUNT = Math.max(
  ...(Object.values(SPREAD_REGISTRY) as SpreadDefinition[]).map((s) => s.cardCount)
);

export function limitSpreadKeyCards(cards: string[]): string[] {
  return cards.slice(0, MAX_SPREAD_CARD_COUNT);
}
