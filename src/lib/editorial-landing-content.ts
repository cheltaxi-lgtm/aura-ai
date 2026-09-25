import { getSpreadIntentBySlug } from "@/lib/spread-intents/registry";

export const EDITORIAL_SECTION_IDS = {
  masters: "наставники",
  session: "как-проходит-сеанс",
  practices: "практики",
  guestSpread: "guest-spread",
  partners: "партнёрам",
  reviews: "отзывы",
} as const;

export const EDITORIAL_HERO = {
  title: "Понять себя. Увидеть ситуацию. Выбрать следующий шаг.",
  subtitle: "Задайте вопрос — три карты покажут, что происходит и какой шаг выбрать дальше.",
  primaryCta: "Открыть 3 карты бесплатно",
  secondaryCta: "Как проходит сеанс",
  microcopy: "3 карты без регистрации · без банковской карты · 18+",
  /** Daily benefit lives in EditorialDailyCardsSection — not in the guest hero. */
  retentionHook: "Каждый день — 3 карты с подсказкой на текущий день",
} as const;

/** Compact multiproduct entries under hero (not full marketing blocks). */
export const EDITORIAL_PRODUCT_ENTRIES = [
  {
    id: "matrix",
    title: "Матрица судьбы",
    text: "Сильные стороны и жизненные темы по дате рождения",
    cta: "Рассчитать бесплатно",
    href: "/numerology/destiny-matrix",
    kind: "link" as const,
  },
  {
    id: "natal",
    title: "Натальная карта",
    text: "Карта рождения и её персональная расшифровка",
    cta: "Построить карту",
    href: "/natalnaya-karta",
    kind: "link" as const,
  },
  {
    id: "hd",
    title: "Дизайн человека",
    text: "Ваш тип, стратегия и особенности взаимодействия",
    cta: "Рассчитать бодиграф",
    href: "/dizayn-cheloveka/rasschitat",
    kind: "link" as const,
  },
  {
    id: "tarot",
    title: "Таро",
    text: "Три карты по вопросу",
    cta: "Открыть 3 карты",
    href: "/?ask=1&spread=1",
    kind: "action" as const,
  },
  {
    id: "aura",
    title: "Аура по фото",
    text: "Символический портрет в цветах по вашему фото",
    cta: "Увидеть ауру",
    href: "/aura",
    kind: "link" as const,
  },
  {
    id: "palm",
    title: "Гадание по ладони",
    text: "Линии и форма руки в традиции хиромантии",
    cta: "Снять ладонь",
    href: "/gadanie-po-ladoni",
    kind: "link" as const,
  },
] as const;

export const EDITORIAL_DAILY_CARDS = {
  kicker: "Ежедневный ритуал",
  title: "Расклад на сутки — каждый день",
  subtitle:
    "Каждый день Zovus помогает увидеть ход ближайших суток: утро, день и вечер. Один расклад — один понятный ориентир.",
  body: "Бесплатно раз в сутки — короткий ориентир, прежде чем день наберёт темп.",
  benefits: [
    { title: "Утро", text: "С чего начать день" },
    { title: "День", text: "На что обратить внимание" },
    { title: "Вечер", text: "С чем завершить сутки" },
  ] as const,
  /** Anonymous CTA opens first free trial (guest intro), not authenticated daily. */
  guestCta: "Первый расклад по вопросу",
  guestCtaHint: "После входа расклад на сутки доступен бесплатно раз в сутки.",
  authAvailableCta: "Открыть расклад на сутки",
  authAvailableTitle: "Бесплатный расклад на сутки",
  authAvailableSubtitle:
    "Посмотрите, что подскажут карты об утре, дне и вечере.",
  authAvailableHint: "Без списания рун · раз в сутки.",
  authOpenedCta: "Посмотреть расклад",
  /** @deprecated use authOpenedCta — kept for transitional imports */
  authUsedCta: "Посмотреть расклад",
  authOpenedTitle: "Ваш расклад на сутки уже ждёт",
  authOpenedSubtitle: "Вернитесь к сохранённому раскладу в любой момент сегодня.",
  authCooldownCta: "Выбрать расклад",
  authCooldownTitle: "Расклад на сутки уже использован",
  authCooldownSubtitle: "Новый будет доступен завтра. Пока можно задать вопрос мастеру.",
  authLoadingLabel: "Проверяем расклад на сутки…",
} as const;

export const EDITORIAL_STARTER_PACK = {
  /** Landing conversion before guest cards — CTA must start the picker, not claim full reading. */
  eyebrow: "Первый расклад",
  title: "Узнайте, что три карты говорят о Вашей ситуации",
  subtitle:
    "Откройте три карты по своему вопросу. После короткого намёка можно получить полный разбор — без повторного выбора карт.",
  benefits: [
    "полный смысл сочетания трёх карт",
    "вероятное развитие ситуации",
    "что сейчас помогает, а что мешает",
    "что стоит сделать дальше",
    "можно продолжить диалог с мастером",
  ] as const,
  secondaryBenefit:
    "После регистрации Вам также будет доступен бесплатный расклад на сутки.",
  spaceBenefit: "Можно вернуться к раскладу позже — он сохранится в Вашем пространстве.",
  runesBenefit: "После регистрации на балансе появятся стартовые руны для первых обращений к мастеру.",
  noCardBenefit: "Без банковской карты.",
  /** Honest next step before cards exist. Full-reading CTA lives in GuestTripletDraw after teaser. */
  primaryCta: "Попробовать 3 карты бесплатно",
  /** @deprecated alias — post-teaser CTA is in GuestTripletDraw */
  fullReadingCta: "Получить полный разбор",
  secondaryCta: "Уже есть аккаунт — войти",
  fine: "18+",
} as const;

export const EDITORIAL_FREE_VALUE = {
  title: "Что доступно бесплатно в Zovus",
  items: [
    {
      title: "Первый персональный расклад",
      text: "Три карты и полный разбор вашей ситуации — чтобы познакомиться с Zovus.",
    },
    {
      title: "Расклад на сутки",
      text: "Каждый день — короткий ориентир на утро, день и вечер.",
    },
    {
      title: "Ваше пространство",
      text: "Можно вернуться к раскладу позже — он сохранится, и диалог с мастером продолжится.",
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
    text: "Напишите, что вас волнует. Можно начать с готового вопроса.",
  },
  {
    icon: "cards" as const,
    title: "Откройте свои карты",
    text: "Откройте карты и прочитайте краткий ответ — бесплатно, без аккаунта.",
  },
  {
    icon: "book" as const,
    title: "Получите трактовку",
    text: "Зарегистрируйтесь, чтобы бесплатно получить первый полный разбор тех же карт.",
  },
  {
    icon: "chat" as const,
    title: "Продолжите диалог",
    text: "Перечитайте сохранённый ответ или задайте уточнение. Стоимость видна до отправки.",
  },
] as const;

/** Additional formats first; core four stay in the array for logged-in / SEO routes. */
export const EDITORIAL_PRACTICES = [
  {
    id: "photo",
    title: "Расклад Таро по фото",
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
  { label: "Натал или матрица", href: "/natal-ili-matrica" },
  { label: "Дизайн Человека", href: "/dizayn-cheloveka" },
  { label: "Таро", href: "/taro" },
  { label: "Гадание", href: "/gadanie" },
  { label: "Расклад Таро по фото", href: "/photo-rasklad" },
  { label: "Гадание по ладони", href: "/gadanie-po-ladoni" },
  { label: "Расклады", href: "/rasklady" },
  { label: "Руны", href: "/runy" },
  { label: "Ленорман", href: "/lenormand" },
  { label: "Нумерология", href: "/numerology" },
  { label: "Гороскоп", href: "/goroskop-na-segodnya" },
  { label: "Прогнозы", href: "/prognoz" },
  { label: "Карты", href: "/cards" },
  { label: "Статьи", href: "/statyi" },
  { label: "FAQ", href: "/faq" },
  { label: "О сервисе", href: "/about" },
  { label: "Telegram-бот", href: "/telegram" },
  { label: "Моё пространство", href: "/cabinet", guestHref: "/auth/user/login" },
];
