import type { RuneConfig } from "@/lib/useRuneConfig";

export const LANDING_FAQ_ITEMS = [
  {
    question: "Можно ли получить расклад бесплатно?",
    answer:
      "До входа: на главной можно открыть три карты и короткий смысл символов бесплатно. После входа: полный разбор этого расклада в чате, история в кабинете, стартовые руны ᚢ на баланс; классический расклад на три карты доступен раз в сутки. Дополнительные действия и уточнения сверх включённых — за руны ᚢ.",
  },
  {
    question: "Как устроена оплата на Zovus?",
    answer:
      "Сеансы идут в рунах ᚢ. Полный разбор, тематический расклад, фото-анализ и дополнительные вопросы списываются с баланса. Актуальный прайс — в разделе «Тарифы».",
  },
  {
    question: "Кто такие наставники?",
    answer:
      "Это ИИ-наставники в художественных образах, а не живые тарологи: вы выбираете традицию и мастера, формулируете вопрос и получаете разбор выпавших символов в чате. Развлекательно-ознакомительный сервис, 18+. Не замена очной консультации.",
  },
  {
    question: "Нужна ли регистрация?",
    answer:
      "Три карты можно открыть без аккаунта. Вход нужен, чтобы сохранить расклад, получить полный разбор именно этих карт и продолжить диалог в кабинете.",
  },
] as const;

export type LandingHeroVariant = "a" | "b" | "c";

const HERO_VARIANT_STORAGE_KEY = "zovus_hero_variant";

const HERO_VARIANTS: Record<
  LandingHeroVariant,
  { heroTitle: string; heroSubtitle: string }
> = {
  a: {
    heroTitle: "Когда нужен разговор с собой",
    heroSubtitle:
      "Тихое место для ясного вопроса: три карты, короткий смысл символов и путь к полному разбору — без спешки и без чужих глаз.",
  },
  b: {
    heroTitle: "Три карты по вашему вопросу — без оплаты",
    heroSubtitle:
      "Сформулируйте вопрос и откройте символы ещё до регистрации. Сохранить расклад и продолжить диалог с наставником — после входа.",
  },
  c: {
    heroTitle: "Три карты Таро — ясный ориентир",
    heroSubtitle:
      "Вопрос о связи, решении или будущем — короткий смысл до регистрации, история и полный разбор в кабинете после входа.",
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
  const finalCtaText =
    "Откройте три карты — увидите короткий смысл символов. Чтобы сохранить расклад и получить полный разбор в чате, понадобится вход.";
  const heroMicrocopy = "3 карты бесплатно · 18+ · развлекательный сервис";
  const primaryCta = "Открыть 3 карты бесплатно";
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
