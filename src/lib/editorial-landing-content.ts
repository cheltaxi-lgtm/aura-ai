import { getSpreadIntentBySlug } from "@/lib/spread-intents/registry";

export const EDITORIAL_SECTION_IDS = {
  masters: "наставники",
  session: "как-проходит-сеанс",
  practices: "практики",
  guestSpread: "guest-spread",
  partners: "партнёрам",
} as const;

export const EDITORIAL_HERO = {
  title: "Спросите то, о чём думаете каждый день",
  subtitle: "Три карты откроются прямо здесь — бесплатно и без регистрации.",
  primaryCta: "Открыть 3 карты",
  secondaryCta: "Как проходит сеанс",
  microcopy: "Бесплатно · без привязки карты · 18+",
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
    loggedInHref: "/?photo=1",
  },
  {
    id: "numerology",
    title: "Нумерология",
    subtitle: "Числа пути, квадрат Пифагора и циклы — с Эвелиной.",
    image: "/landing/practices/numerology.jpg",
    cta: "Перейти к числам",
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
  { label: "Таро", href: "/rasklad" },
  { label: "Нумерология", href: "/numerology" },
  { label: "Моё пространство", href: "/cabinet", guestHref: "/auth/user/login" },
];
