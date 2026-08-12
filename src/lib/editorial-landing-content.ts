import { getSpreadIntentBySlug } from "@/lib/spread-intents/registry";

export const EDITORIAL_SECTION_IDS = {
  masters: "наставники",
  session: "как-проходит-сеанс",
  practices: "практики",
  guestSpread: "guest-spread",
  partners: "партнёрам",
} as const;

export const EDITORIAL_HERO = {
  title: "Расклад Таро онлайн бесплатно",
  subtitle:
    "Три карты откроются прямо здесь — без регистрации. Или загрузите фото своего расклада на расшифровку.",
  primaryCta: "Открыть 3 карты бесплатно",
  secondaryCta: "Как проходит сеанс",
  microcopy: "Без регистрации · без банковской карты · 18+",
  /** Rolling 24h server cooldown — keep copy honest (раз в сутки). */
  retentionHook: "После регистрации — 3 карты дня бесплатно раз в сутки",
} as const;

export const EDITORIAL_DAILY_CARDS = {
  kicker: "После регистрации",
  title: "3 карты дня бесплатно",
  subtitle:
    "Каждые сутки — новый ориентир: на что обратить внимание, где Ваш ресурс и что потребует осторожности.",
  body: "Бесплатно раз в сутки. Это отдельная возможность — не путать со стартовым раскладом с лендинга.",
  /** Anonymous CTA opens guest intro (startGuestSpread), not authenticated daily. */
  guestCta: "Открыть 3 карты сейчас",
  guestCtaHint:
    "После регистрации этот формат будет доступен бесплатно раз в сутки.",
  authAvailableCta: "Открыть карты дня",
  authUsedCta: "Посмотреть сегодняшний расклад",
  authLoadingLabel: "Проверяем карты дня…",
} as const;

export const EDITORIAL_FREE_VALUE = {
  title: "Что доступно бесплатно в Zovus",
  items: [
    {
      title: "Первый персональный расклад",
      text: "3 карты до регистрации и полный разбор после входа — один раз для знакомства.",
    },
    {
      title: "3 карты дня",
      text: "Раз в сутки после регистрации — короткий ориентир на текущий день.",
    },
    {
      title: "История",
      text: "Сохранение раскладов и продолжение диалога с мастером в кабинете.",
    },
  ],
} as const;

export type EditorialTopic = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  intentSlug: string;
};

function truncateAtWord(text: string, maxLen: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxLen) return normalized;
  const slice = normalized.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.45) return `${slice.slice(0, lastSpace)}…`;
  return `${slice.trimEnd()}…`;
}

function topicFromIntent(
  id: string,
  title: string,
  subtitle: string,
  image: string,
  intentSlug: string
): EditorialTopic {
  const intent = getSpreadIntentBySlug(intentSlug);
  return {
    id,
    title,
    subtitle: intent?.intro ? truncateAtWord(intent.intro, 72) : subtitle,
    image,
    intentSlug,
  };
}

export const EDITORIAL_TOPICS: EditorialTopic[] = [
  topicFromIntent(
    "relations",
    "Отношения",
    "Связь, дистанция и то, что сложно сказать вслух",
    "/landing/topics/relations.jpg",
    "chto-mezhdu-nami"
  ),
  topicFromIntent(
    "choice",
    "Выбор",
    "Когда путей несколько — и нужен спокойный взгляд",
    "/landing/topics/choice.jpg",
    "stoit-li-idti-dalshe"
  ),
  topicFromIntent(
    "self",
    "Самопознание",
    "Что происходит внутри и на что опереться",
    "/landing/topics/self-knowledge.jpg",
    "chto-so-mnoy-proiskhodit"
  ),
  topicFromIntent(
    "work",
    "Работа",
    "Решение о месте, риске и следующем шаге",
    "/landing/topics/work.jpg",
    "stoit-li-menyat-rabotu"
  ),
];

export const EDITORIAL_SESSION_STEPS = [
  {
    icon: "question" as const,
    title: "Сформулируйте вопрос",
    text: "Достаточно одной честной формулировки — о связи, решении или внутреннем состоянии.",
  },
  {
    icon: "cards" as const,
    title: "Откройте символы",
    text: "Три карты открываются под ваш запрос — ещё до регистрации.",
  },
  {
    icon: "book" as const,
    title: "Получите трактовку",
    text: "Сначала короткий смысл символов, затем полный разбор у выбранного мастера.",
  },
  {
    icon: "chat" as const,
    title: "Продолжите диалог",
    text: "Уточняйте детали в чате — мастер удерживает нить разговора в рамках сеанса.",
  },
] as const;

export const EDITORIAL_PRACTICES = [
  {
    id: "matrix",
    title: "Матрица судьбы",
    subtitle: "Дата рождения — и схема на экране. Без анкеты и без оплаты за расчёт.",
    image: "/landing/practices/destiny-matrix.jpg",
    cta: "Рассчитать бесплатно",
    /** Free preview — skip registration gate for guests. */
    guestHref: "/numerology/destiny-matrix",
    guestReturn: { custom: "/numerology/destiny-matrix" },
    loggedInHref: "/numerology/destiny-matrix",
  },
  {
    id: "tarot",
    title: "Классическое Таро",
    subtitle: "Три карты по вашему вопросу — ясный ориентир ещё до оплаты.",
    image: "/landing/practices/classic-tarot.jpg",
    cta: "Открыть три карты",
    /** Free guest triplet — no registration before first personal result. */
    guestHref: "/?ask=1&spread=1",
    guestReturn: { guestSpread: true },
    loggedInHref: "/rasklad",
  },
  {
    id: "photo",
    title: "ФотоТаро",
    subtitle: "Сфотографируйте свой расклад — мастер разберёт каждую позицию.",
    image: "/landing/practices/photo-tarot.jpg",
    cta: "Загрузить фото расклада",
    guestReturn: { photo: true },
    loggedInHref: "/photo-rasklad",
  },
  {
    id: "numerology",
    title: "Нумерология",
    subtitle: "Числа пути, квадрат Пифагора и циклы — с Эвелиной.",
    image: "/landing/practices/numerology.jpg",
    cta: "Перейти к числам",
    guestHref: "/numerology",
    guestReturn: { custom: "/numerology" },
    loggedInHref: "/numerology",
  },
  {
    id: "natal",
    title: "Натальная карта",
    subtitle: "Карта рождения и личные периоды — сначала публичный разбор, затем кабинет.",
    image: "/landing/practices/natal-chart.jpg",
    cta: "Открыть астрологию",
    guestHref: "/natalnaya-karta",
    guestReturn: { custom: "/natalnaya-karta" },
    loggedInHref: "/cabinet/astrology",
  },
] as const;

export const EDITORIAL_FOOTER_TAGLINE =
  "Таро · матрица · астрология · нумерология";

export type EditorialNavItem =
  | { label: string; href: string; guestHref?: string }
  | { label: string; hash: string };

export const EDITORIAL_NAV: EditorialNavItem[] = [
  { label: "Практики", hash: EDITORIAL_SECTION_IDS.practices },
  { label: "Мастера", hash: EDITORIAL_SECTION_IDS.masters },
  { label: "Матрица судьбы", href: "/numerology/destiny-matrix" },
  { label: "Натальная карта", href: "/natalnaya-karta" },
  { label: "Таро", href: "/taro" },
  { label: "Гадание", href: "/gadanie" },
  { label: "Фото-расклад", href: "/photo-rasklad" },
  { label: "Расклады", href: "/rasklady" },
  { label: "Руны", href: "/runy" },
  { label: "Ленорман", href: "/lenormand" },
  { label: "Нумерология", href: "/numerology" },
  { label: "Прогнозы", href: "/prognoz" },
  { label: "Карты", href: "/cards" },
  { label: "Статьи", href: "/statyi" },
  { label: "FAQ", href: "/faq" },
  { label: "О сервисе", href: "/about" },
  { label: "Telegram-бот", href: "/telegram" },
  { label: "Моё пространство", href: "/cabinet", guestHref: "/auth/user/login" },
];
