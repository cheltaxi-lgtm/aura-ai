import type { SpreadIntentCategory } from "@/lib/spread-intents/types";

export type SpreadHubConfig = {
  slug: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  h1: string;
  intro: string;
  category: SpreadIntentCategory;
  /** Explicit intent slugs to list first; rest filled from category. */
  featuredSlugs: string[];
  faq: { q: string; a: string }[];
};

export const SPREAD_HUBS: SpreadHubConfig[] = [
  {
    slug: "lyubov",
    title: "Любовь и отношения",
    seoTitle: "Расклады Таро на любовь онлайн — каталог вопросов | Zovus",
    seoDescription:
      "Расклад Таро на любовь и отношения: что он чувствует, вернётся ли, есть ли измена. Готовые вопросы онлайн, персональная расшифровка и чат с мастером на Zovus.",
    h1: "Расклады Таро на любовь и отношения",
    intro:
      "Вопросы о связи, дистанции, верности и перспективе пары. Выберите готовый вопрос — получите схему карт и спокойный разбор с возможностью уточнить в чате.",
    category: "love",
    featuredSlugs: [
      "chto-on-chuvstvuet",
      "lyubit-li-on-menya",
      "vernyotsya-li-on",
      "pozvonit-li-on",
      "napishut-li-on",
      "budem-li-my-vmeste",
      "sovmestimost-pary",
      "chto-mezhdu-nami",
      "skuchayet-li-on",
      "pochemu-on-molchit",
    ],
    faq: [
      {
        q: "Можно ли гадать на конкретного человека?",
        a: "Да. Сформулируйте вопрос о человеке — мастер учтёт контекст в расшифровке.",
      },
      {
        q: "Какой расклад выбрать на чувства?",
        a: "Для глубины — «Что он чувствует» или «Совместимость пары». Для быстрого ответа — «Любит ли он» или «Позвонит ли он».",
      },
      {
        q: "Подстраиваются ли формулировки под пол?",
        a: "Да. В анкете можно указать пол — вопросы про партнёра адаптируются («он» / «она»).",
      },
    ],
  },
  {
    slug: "vernost-i-doverie",
    title: "Верность и доверие",
    seoTitle: "Расклад на верность и измену — Таро онлайн | Zovus",
    seoDescription:
      "Расклады Таро на верность, измену и доверие в паре. Спокойная трактовка без паники: карты, расшифровка и чат с мастером на Zovus.",
    h1: "Расклады на верность и доверие",
    intro:
      "Когда тревога о верности сильнее фактов — расклад показывает динамику пары без допроса и без паники. Начните с готового вопроса или загрузите фото своего расклада.",
    category: "love",
    featuredSlugs: [
      "est-li-izmena",
      "izmenshchik-li-on",
      "na-izmenu",
      "na-vernost",
      "vret-li-on",
      "iskrenen-li-on",
      "stojit-li-doveryat",
      "revenuet-li-on",
    ],
    faq: [
      {
        q: "Как правильно спросить карты об измене?",
        a: "Лучше «что происходит с доверием в паре», чем допрос. Так ответ точнее и спокойнее.",
      },
      {
        q: "Гарантирует ли расклад правду?",
        a: "Нет. Карты показывают энергию ситуации, а не доказательства. Это инструмент рефлексии, не детектор.",
      },
    ],
  },
  {
    slug: "chuvstva-i-myisli",
    title: "Чувства и мысли",
    seoTitle: "Что он чувствует и думает — расклады Таро | Zovus",
    seoDescription:
      "Расклады на чувства, мысли и скрытые мотивы партнёра. Персональная расшифровка с мастером Zovus.",
    h1: "Расклады на чувства и мысли",
    intro:
      "Когда важно понять внутреннее состояние партнёра — мысли, чувства и то, что остаётся невысказанным.",
    category: "love",
    featuredSlugs: [
      "chto-on-chuvstvuet",
      "chto-on-dumaet-obo-mne",
      "chto-u-nego-na-serdce",
      "chto-ya-dlya-nego-znachu",
      "chto-on-skryvaet",
      "chto-on-delaet-seychas",
      "chto-u-nego-v-zhizni",
      "zhelaet-li-on-menya",
    ],
    faq: [
      {
        q: "Чем отличается расклад на чувства от расклада на мысли?",
        a: "Чувства — про эмоции и отношение. Мысли — про намерения и внутренний диалог. Часто их объединяют в одной схеме.",
      },
    ],
  },
  {
    slug: "budushchee-otnoshenij",
    title: "Будущее отношений",
    seoTitle: "Будущее отношений — расклад Таро онлайн | Zovus",
    seoDescription:
      "Вернётся ли он, будем ли вместе, перспектива пары. Расклады на будущее отношений с расшифровкой.",
    h1: "Расклады на будущее отношений",
    intro:
      "Перспектива пары, возврат после паузы, шанс на примирение — карты показывают вектор, а не гарантированную дату.",
    category: "love",
    featuredSlugs: [
      "vernyotsya-li-on",
      "budem-li-my-vmeste",
      "perspektiva-otnosheniy",
      "kogda-vernetsya",
      "pomirimsya-li-my",
      "zhdat-ili-zabyt",
      "pauza-ili-konec",
    ],
    faq: [
      {
        q: "Можно ли узнать точную дату?",
        a: "Карты показывают окно возможностей и энергию, а не календарную дату. Для сроков лучше расклад «Когда вернётся» или тройка «прошлое — настоящее — будущее».",
      },
    ],
  },
  {
    slug: "kariera",
    title: "Карьера и работа",
    seoTitle: "Расклады Таро на карьеру и работу | Zovus",
    seoDescription:
      "Смена работы, повышение, собеседование, увольнение. Карьерные расклады с расшифровкой от мастера.",
    h1: "Расклады на карьеру и работу",
    intro:
      "Карьерные вопросы — про выбор, риск и срок. Таро показывает, где вы сейчас и куда ведёт путь.",
    category: "career",
    featuredSlugs: [
      "stoit-li-menyat-rabotu",
      "budet-li-povyshenie",
      "kak-proyti-sobesedovanie",
      "stoit-li-uvolnyatsya",
      "chto-menya-tormozit",
    ],
    faq: [
      {
        q: "Какой расклад на смену работы?",
        a: "«Стоит ли менять работу» — быстрый ответ. Для глубины — расклад на ситуацию из 5 карт.",
      },
    ],
  },
  {
    slug: "budushchee",
    title: "Будущее и прогноз",
    seoTitle: "Расклад Таро на будущее — гадание онлайн | Zovus",
    seoDescription:
      "Расклад Таро на будущее: что ждёт в ближайшие недели и месяцы. Три карты бесплатно до регистрации; полный разбор — с ИИ-наставником на Zovus.",
    h1: "Расклад Таро на будущее",
    intro:
      "Когда хочется увидеть вектор событий — на неделю, месяц или год. Карты показывают тенденции и совет, а не жёсткий сценарий.",
    category: "future",
    featuredSlugs: [
      "blizhayshee-budushchee",
      "chto-menya-zhdet",
      "chto-zhdet-zavtra",
      "god-vpered",
      "prognoz-na-mesyac",
      "karta-dnya",
      "na-segodnya",
    ],
    faq: [
      {
        q: "Можно ли узнать точную дату по картам?",
        a: "Карты показывают окно возможностей и энергию периода, а не календарную дату.",
      },
      {
        q: "Какой расклад на ближайшее будущее?",
        a: "Три карты или расклад «Ближайшее будущее» — для быстрого ответа. Для года — схема «Год вперёд».",
      },
    ],
  },
];

export function getSpreadHubBySlug(slug: string): SpreadHubConfig | undefined {
  return SPREAD_HUBS.find((h) => h.slug === slug);
}

export function getAllSpreadHubSlugs(): string[] {
  return SPREAD_HUBS.map((h) => h.slug);
}
