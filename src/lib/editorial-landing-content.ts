import { getSpreadIntentBySlug } from "@/lib/spread-intents/registry";

export const EDITORIAL_SECTION_IDS = {
  masters: "наставники",
  session: "как-проходит-сеанс",
  practices: "практики",
  guestSpread: "guest-spread",
} as const;

export const EDITORIAL_HERO = {
  title: "Когда нужен разговор с собой",
  subtitle:
    "Приватное пространство для рефлексии: расклад, расшифровка и диалог с проводником — в своём темпе, без очереди.",
  primaryCta: "Открыть 3 карты",
  secondaryCta: "Как проходит сеанс",
  microcopy: "3 карты бесплатно · 18+ · конфиденциально",
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
    "Что он чувствует и что скрывает",
    "/landing/topics/relations.jpg",
    "chto-on-chuvstvuet"
  ),
  topicFromIntent(
    "choice",
    "Выбор",
    "Развилка, риск и совет карт",
    "/landing/topics/choice.jpg",
    "blizhayshee-budushchee"
  ),
  topicFromIntent(
    "self",
    "Самопознание",
    "Скрытые стороны и внутренний ресурс",
    "/landing/topics/self-knowledge.jpg",
    "chto-so-mnoy-proiskhodit"
  ),
  topicFromIntent(
    "work",
    "Работа",
    "Карьера, деньги и смена пути",
    "/landing/topics/work.jpg",
    "stoit-li-menyat-rabotu"
  ),
];

export const EDITORIAL_SESSION_STEPS = [
  {
    icon: "question" as const,
    title: "Сформулируйте вопрос",
    text: "Принесите то, что важно сейчас — о решении, отношениях или внутреннем состоянии.",
  },
  {
    icon: "cards" as const,
    title: "Откройте символы",
    text: "Карты раскрываются под ваш запрос — ещё до регистрации.",
  },
  {
    icon: "book" as const,
    title: "Получите трактовку",
    text: "Краткий ориентир по символам, затем полная расшифровка у выбранного мастера.",
  },
  {
    icon: "chat" as const,
    title: "Продолжите диалог",
    text: "Уточняйте детали в чате — контекст сохраняется в рамках сеанса.",
  },
] as const;

export const EDITORIAL_PRACTICES = [
  {
    id: "tarot",
    title: "Классическое Таро",
    subtitle: "Откройте три карты — увидите ориентир по вопросу ещё до оплаты",
    image: "/landing/practices/classic-tarot.jpg",
    cta: "Зарегистрироваться и начать",
    guestReturn: { guestSpread: true },
    loggedInHref: "/rasklad",
  },
  {
    id: "photo",
    title: "ФотоТаро",
    subtitle: "Сфотографируйте свой расклад — мастер расшифрует каждый символ",
    image: "/landing/practices/photo-tarot.jpg",
    cta: "Зарегистрироваться и начать",
    guestReturn: { photo: true },
    loggedInHref: "/?photo=1",
  },
  {
    id: "numerology",
    title: "Нумерология",
    subtitle: "Числа судьбы и циклы — персональный разбор после входа",
    image: "/landing/practices/numerology.jpg",
    cta: "Зарегистрироваться и начать",
    guestReturn: { custom: "/numerology" },
    loggedInHref: "/numerology",
  },
  {
    id: "natal",
    title: "Натальная карта",
    subtitle: "Карта рождения, знаки и периоды — расчёт и трактовка в кабинете",
    image: "/landing/practices/natal-chart.jpg",
    cta: "Зарегистрироваться и получить",
    guestReturn: { custom: "/cabinet/astrology" },
    loggedInHref: "/cabinet/astrology",
  },
] as const;

export const EDITORIAL_FOOTER_TAGLINE =
  "Таро · руны · астрология · нумерология — в одном пространстве";

export type EditorialNavItem =
  | { label: string; href: string; guestHref?: string }
  | { label: string; hash: string };

export const EDITORIAL_NAV: EditorialNavItem[] = [
  { label: "Практики", hash: EDITORIAL_SECTION_IDS.practices },
  { label: "Мастера", hash: EDITORIAL_SECTION_IDS.masters },
  { label: "Таро", href: "/rasklad" },
  { label: "Нумерология", href: "/numerology" },
  { label: "Моё пространство", href: "/cabinet", guestHref: "/auth/user/login" },
];
