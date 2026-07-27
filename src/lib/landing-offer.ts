import type { RuneConfig } from "@/lib/useRuneConfig";

export const LANDING_FAQ_ITEMS = [
  {
    question: "Это правда бесплатно?",
    answer:
      "Да. Три карты и короткий смысл символов открываются без аккаунта и без оплаты. Карту привязывать не нужно.",
  },
  {
    question: "Кто увидит мой вопрос?",
    answer:
      "Вопрос обрабатывается для оказания услуги. По политике конфиденциальности данные могут передаваться провайдерам API искусственного интеллекта и инфраструктуры исключительно в объёме, необходимом для ответа — подробности в",
  },
  {
    question: "Это живой таролог или ИИ?",
    answer:
      "Наставники Zovus — ИИ на базе языковых моделей в художественных образах, а не живые тарологи. Мы говорим об этом до оплаты, а не в сноске. Развлекательно-ознакомительный сервис 18+, не замена очной консультации.",
  },
  {
    question: "С меня спишут деньги?",
    answer:
      "Нет. Оплата только через пополнение баланса в рунах ᚢ, автосписаний нет. Первый расклад и стартовые руны — бесплатно.",
  },
  {
    question: "Что будет после входа?",
    answer:
      "Полный разбор именно этого расклада в чате, история в кабинете и стартовые руны ᚢ на баланс. Классический расклад на три карты — раз в сутки. Дополнительные действия и уточнения сверх включённых — за руны ᚢ.",
  },
] as const;

export type LandingHeroVariant = "a" | "b" | "c";

const HERO_VARIANT_STORAGE_KEY = "zovus_hero_variant";

const HERO_VARIANTS: Record<
  LandingHeroVariant,
  { heroTitle: string; heroSubtitle: string }
> = {
  a: {
    heroTitle: "Спросите то, о чём думаете каждый день",
    heroSubtitle: "Три карты откроются прямо здесь — бесплатно и без регистрации.",
  },
  b: {
    heroTitle: "Спросите то, о чём думаете каждый день",
    heroSubtitle: "Три карты откроются прямо здесь — бесплатно и без регистрации.",
  },
  c: {
    heroTitle: "Спросите то, о чём думаете каждый день",
    heroSubtitle: "Три карты откроются прямо здесь — бесплатно и без регистрации.",
  },
};

export function resolveLandingHeroVariant(): LandingHeroVariant {
  if (typeof window === "undefined") return "a";
  try {
    const stored = localStorage.getItem(HERO_VARIANT_STORAGE_KEY);
    if (stored === "a" || stored === "b" || stored === "c") return stored;
    const roll = Math.random();
    const variant: LandingHeroVariant = roll < 0.34 ? "a" : roll < 0.67 ? "b" : "c";
    localStorage.setItem(HERO_VARIANT_STORAGE_KEY, variant);
    return variant;
  } catch {
    return "a";
  }
}

export function buildLandingOfferCopy(
  config: RuneConfig,
  formatRunes: (n: number) => string,
  formatRunesWithRub?: (n: number) => string,
  heroVariant: LandingHeroVariant = "a"
) {
  const freeQ = config.freeQuestions;
  const freeQLabel =
    freeQ === 1 ? "1 вопрос" : freeQ < 5 ? `${freeQ} вопроса` : `${freeQ} вопросов`;
  const fmtPrice = formatRunesWithRub ?? formatRunes;

  const heroCopy = HERO_VARIANTS[heroVariant] ?? HERO_VARIANTS.a;

  const heroEyebrow = "Приватный цифровой салон · 3 карты бесплатно";
  const heroTitle = heroCopy.heroTitle;
  const heroSubtitle = heroCopy.heroSubtitle;
  const finalCtaText = "Три карты бесплатно. Дальше решаете вы.";
  const heroMicrocopy = "Бесплатно · без привязки карты · 18+";
  const primaryCta = "Открыть 3 карты";
  const secondaryCta = "Как проходит сеанс";

  const pricingLine = config.enabled
    ? `3 карты бесплатно · разбор ≈ ${fmtPrice(config.costs.READING)} · ${freeQLabel} мастеру бесплатно`
    : `3 карты бесплатно · ${freeQLabel} мастеру бесплатно`;

  const seoFreeParagraph =
    "На главной три карты открываются бесплатно до регистрации. После входа классический расклад на три карты — раз в сутки; история сохраняется в кабинете. Полные расклады, фото-анализ, нумерология и обряды — по тарифу в рунах ᚢ.";

  return {
    heroEyebrow,
    heroTitle,
    heroSubtitle,
    finalCtaText,
    heroMicrocopy,
    primaryCta,
    secondaryCta,
    pricingLine,
    seoFreeParagraph,
    heroVariant,
  };
}

export const GUEST_SPREAD_SECTION_ID = "guest-spread";
/** The interactive age gate/card picker, separate from the promotional CTA section. */
export const GUEST_SPREAD_PICKER_ID = "guest-spread-picker";
export const GUEST_SPREAD_START_EVENT = "zovus:start-guest-spread";
export const GUEST_SPREAD_RESET_EVENT = "zovus:reset-guest-spread";
export const GUEST_SPREAD_DRAFT_KEY = "zovus_guest_spread_draft";
export const LANDING_QUESTION_KEY = "zovus_landing_question";

/** Free 3-card landing spread is always classic Rider-Waite tarot with Veronika. */
export const GUEST_TRIPLET_MASTER_ID = "veronika";

export type GuestSpreadStartDetail = {
  question?: string;
  masterId?: string;
};

/** Pain-language chips for guest hero — reuse intent slugs, change only labels. */
export const GUEST_HERO_PAIN_CHIPS = [
  { label: "Он не пишет третий день", intentSlug: "chto-mezhdu-nami" },
  { label: "Уволиться или терпеть", intentSlug: "stoit-li-menyat-rabotu" },
  { label: "Мы вообще вместе?", intentSlug: "chto-mezhdu-nami" },
  { label: "Куда уходят деньги", intentSlug: "stoit-li-idti-dalshe" },
  { label: "Что меня ждёт", intentSlug: "chto-so-mnoy-proiskhodit" },
] as const;
