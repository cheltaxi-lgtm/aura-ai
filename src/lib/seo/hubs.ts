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
    seoTitle: "Расклады Таро на любовь — 50+ вопросов онлайн | Zovus",
    seoDescription:
      "Расклады на любовь, чувства, отношения и будущее пары. Выберите вопрос — мастер подберёт схему и даст расшифровку в чате.",
    h1: "Расклады на любовь и отношения",
    intro:
      "Самые частые вопросы о чувствах, контакте, верности и перспективе пары. Каждый расклад — готовая схема карт и персональная трактовка с возможностью уточнить в чате.",
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
    seoTitle: "Расклад на верность и измену — все вопросы | Zovus",
    seoDescription:
      "Расклады на измену, верность и доверие в паре. Спокойная трактовка без паники — карты, расшифровка, чат с мастером.",
    h1: "Расклады на верность и доверие",
    intro:
      "Когда тревога о верности сильнее фактов, расклад помогает увидеть энергию пары и скрытые аспекты — без допроса, с опорой на карты.",
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
      "Когда хочется понять, что происходит в голове и сердце другого человека — эти расклады показывают мысли, чувства и то, что скрыто.",
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
      "Карьерные вопросы — про выбор, риск и timing. Таро показывает, где вы сейчас и куда ведёт путь.",
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
];

export function getSpreadHubBySlug(slug: string): SpreadHubConfig | undefined {
  return SPREAD_HUBS.find((h) => h.slug === slug);
}

export function getAllSpreadHubSlugs(): string[] {
  return SPREAD_HUBS.map((h) => h.slug);
}
