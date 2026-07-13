import type { RuneConfig } from "@/lib/useRuneConfig";

export const LANDING_FAQ_ITEMS = [
  {
    question: "Можно ли получить расклад бесплатно?",
    answer:
      "Да. На главной можно открыть бесплатный расклад из трёх карт до регистрации — с кратким ориентиром по символам. После регистрации расклад сохраняется в кабинете, а первые вопросы мастеру в сеансе включены бесплатно. Полная расшифровка и дополнительные функции оплачиваются рунами ᚢ.",
  },
  {
    question: "Как устроена оплата на Zovus?",
    answer:
      "Основная валюта сеансов — руны ᚢ. Полная расшифровка, расклад на тему, фото-анализ и дополнительные вопросы списываются с баланса. Актуальный прайс и курс к рублю — в разделе «Тарифы» в верхнем меню.",
  },
  {
    question: "Чем онлайн-расклад на Zovus отличается от живого таролога?",
    answer:
      "Вы выбираете мастера и систему (Таро, руны, астрология, славянское ведовство), формулируете вопрос и получаете ответ в чате с учётом выпавших символов. Это структурированный диалог с ИИ-наставником в выбранной традиции.",
  },
  {
    question: "Нужна ли регистрация?",
    answer:
      "Карты можно открыть без аккаунта. Регистрация нужна, чтобы сохранить расклад, получить полную расшифровку и продолжить сеанс с мастером в личном кабинете.",
  },
] as const;

export type LandingHeroVariant = "a" | "b" | "c";

const HERO_VARIANT_STORAGE_KEY = "zovus_hero_variant";

const HERO_VARIANTS: Record<
  LandingHeroVariant,
  { heroTitle: string; heroSubtitle: string }
> = {
  a: {
    heroTitle: "Что он думает и что чувствует? Три карты покажут без оплаты",
    heroSubtitle:
      "Сформулируйте вопрос, откройте символы и получите краткий ориентир по раскладу ещё до регистрации. Сохранить результат и продолжить диалог с мастером можно после входа.",
  },
  b: {
    heroTitle: "Три карты Таро — бесплатный ориентир по вашему вопросу",
    heroSubtitle:
      "Откройте символы за минуту, без оплаты и без регистрации. Полную расшифровку и диалог с мастером можно продолжить после входа.",
  },
  c: {
    heroTitle: "Узнайте, что скрывают карты — бесплатный расклад из 3 символов",
    heroSubtitle:
      "Задайте вопрос об отношениях, решении или будущем — получите краткий ориентир до регистрации и сохраните расклад в кабинете после входа.",
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

  const heroEyebrow = "Персональный расклад · 3 карты бесплатно";
  const heroTitle = heroCopy.heroTitle;
  const heroSubtitle = heroCopy.heroSubtitle;
  const finalCtaText =
    "Откройте три карты — увидите краткий ориентир по символам. Регистрация понадобится, чтобы сохранить расклад и получить полную расшифровку в чате.";
  const heroMicrocopy = "Без оплаты · 18+ · сохранятся после регистрации";
  const primaryCta = "Открыть 3 карты бесплатно";
  const secondaryCta = "Выбрать мастера";

  const pricingLine = config.enabled
    ? `3 карты бесплатно · расшифровка ≈ ${fmtPrice(config.costs.READING)} · ${freeQLabel} мастеру бесплатно`
    : `3 карты бесплатно · ${freeQLabel} мастеру бесплатно`;

  const seoFreeParagraph =
    "Откройте бесплатный расклад из трёх карт на главной. После регистрации расклад сохраняется в кабинете. Полные расклады, фото-анализ, нумерология и обряды — по тарифу в рунах ᚢ.";

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
export const GUEST_SPREAD_START_EVENT = "zovus:start-guest-spread";
export const LANDING_QUESTION_KEY = "zovus_landing_question";

export type GuestSpreadStartDetail = {
  question?: string;
  masterId?: string;
};
