import type { RuneConfig } from "@/lib/useRuneConfig";

export const LANDING_FAQ_ITEMS = [
  {
    question: "Можно ли получить расклад бесплатно?",
    answer:
      "Да. На главной можно открыть бесплатный расклад из трёх карт до регистрации. После регистрации расклад сохраняется в кабинете, а первые вопросы мастеру в сеансе включены бесплатно. Полная расшифровка и дополнительные функции оплачиваются рунами ᚢ.",
  },
  {
    question: "Как устроена оплата на Zovus?",
    answer:
      "Основная валюта сеансов — руны ᚢ. Полная расшифровка, расклад на тему, фото-анализ и дополнительные вопросы списываются с баланса. Актуальный прайс и курс к рублю — в разделе «Тарифы» в шапке сайта.",
  },
  {
    question: "Чем онлайн-расклад на Zovus отличается от живого таролога?",
    answer:
      "Вы выбираете мастера и систему (Таро, руны, астрология, славянское ведовство), формулируете вопрос и получаете ответ в чате с учётом выпавших символов. Это структурированный диалог с ИИ-наставником в выбранной традиции.",
  },
  {
    question: "Нужна ли регистрация?",
    answer:
      "Карты можно открыть без аккаунта. Регистрация нужна, чтобы сохранить расклад, получить расшифровку и продолжить сеанс с мастером в личном кабинете.",
  },
] as const;

export function buildLandingOfferCopy(config: RuneConfig, formatRunes: (n: number) => string) {
  const freeQ = config.freeQuestions;
  const freeQLabel =
    freeQ === 1 ? "1 вопрос" : freeQ < 5 ? `${freeQ} вопроса` : `${freeQ} вопросов`;

  const heroEyebrow = "Персональный расклад · 3 карты бесплатно";
  const heroTitle = "Задайте вопрос и откройте карты, которые говорят о вашей ситуации";
  const heroSubtitle =
    "Сначала вы увидите свой расклад. Регистрация понадобится, чтобы сохранить его и продолжить разговор с ИИ-мастером в художественном образе.";
  const heroMicrocopy = "Без оплаты · 18+ · вопрос и карты сохранятся";
  const primaryCta = "Открыть 3 карты бесплатно";
  const secondaryCta = "Выбрать мастера";

  const pricingLine = config.enabled
    ? `3 карты бесплатно · ${freeQLabel} мастеру бесплатно · полная расшифровка — ${formatRunes(config.costs.READING)}`
    : `3 карты бесплатно · ${freeQLabel} мастеру бесплатно`;

  const seoFreeParagraph =
    "Откройте бесплатный расклад из трёх карт на главной. После регистрации расклад сохраняется в кабинете. Полные расклады, фото-анализ, нумерология и обряды — по тарифу в рунах ᚢ.";

  return {
    heroEyebrow,
    heroTitle,
    heroSubtitle,
    heroMicrocopy,
    primaryCta,
    secondaryCta,
    pricingLine,
    seoFreeParagraph,
  };
}

export const GUEST_SPREAD_SECTION_ID = "guest-spread";
export const GUEST_SPREAD_START_EVENT = "zovus:start-guest-spread";
export const LANDING_QUESTION_KEY = "zovus_landing_question";

export type GuestSpreadStartDetail = {
  question?: string;
  masterId?: string;
};
