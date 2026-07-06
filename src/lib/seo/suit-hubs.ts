import type { TarotCard } from "@/lib/tarot";
import { FULL_DECK } from "@/lib/tarot";
import { cardSeoSlug } from "@/lib/card-seo";

export type SuitHubConfig = {
  slug: string;
  suit: "cups" | "wands" | "swords" | "pentacles";
  titleRu: string;
  titleGenitive: string;
  element: string;
  seoTitle: string;
  seoDescription: string;
  h1: string;
  intro: string;
  faq: { q: string; a: string }[];
};

export const SUIT_HUBS: SuitHubConfig[] = [
  {
    slug: "kubki",
    suit: "cups",
    titleRu: "Кубки",
    titleGenitive: "Кубков",
    element: "Вода · чувства и отношения",
    seoTitle: "Кубки в Таро — значение масти и все 14 карт | Zovus",
    seoDescription:
      "Кубки в Таро: значение масти чувств и отношений. Все 14 карт Кубков с толкованием в любви, работе и сочетаниях — справочник Zovus.",
    h1: "Кубки в Таро: значение масти",
    intro:
      "Масть Кубков связана с эмоциями, любовью, интуицией и близостью. В раскладах она отвечает за чувства, отклик сердца и глубину связи.",
    faq: [
      {
        q: "Что означают Кубки в раскладе на отношения?",
        a: "Кубки показывают эмоциональный фон, взаимность чувств и готовность к близости — от романтики до семейной гармонии.",
      },
      {
        q: "Чем Кубки отличаются от других мастей?",
        a: "Кубки — про чувства. Жезлы — про действие, Мечи — про мысли, Пентакли — про материю и ресурсы.",
      },
    ],
  },
  {
    slug: "mechi",
    suit: "swords",
    titleRu: "Мечи",
    titleGenitive: "Мечей",
    element: "Воздух · мысли и решения",
    seoTitle: "Мечи в Таро — значение масти и все 14 карт | Zovus",
    seoDescription:
      "Мечи в Таро: значение масти разума, конфликтов и ясности. Все 14 карт Мечей с толкованием — справочник Zovus.",
    h1: "Мечи в Таро: значение масти",
    intro:
      "Масть Мечей отражает мысли, слова, конфликты и поиск истины. В раскладах она показывает, где нужна ясность, а где — риск жёсткости.",
    faq: [
      {
        q: "Всегда ли Мечи — плохой знак?",
        a: "Нет. Мечи часто означают правду, решение или необходимость честного разговора, а не только боль.",
      },
      {
        q: "Мечи в раскладе на отношения",
        a: "Мечи показывают мысли партнёра, напряжение, недопонимание или ясность после разговора.",
      },
    ],
  },
  {
    slug: "zhezly",
    suit: "wands",
    titleRu: "Жезлы",
    titleGenitive: "Жезлов",
    element: "Огонь · действие и энергия",
    seoTitle: "Жезлы в Таро — значение масти и все 14 карт | Zovus",
    seoDescription:
      "Жезлы в Таро: значение масти действия, страсти и амбиций. Все 14 карт Жезлов с толкованием — справочник Zovus.",
    h1: "Жезлы в Таро: значение масти",
    intro:
      "Жезлы символизируют энергию, движение, творчество и стремление к цели. В раскладах они показывают импульс, мотивацию и готовность действовать.",
    faq: [
      {
        q: "Жезлы в любви",
        a: "Жезлы говорят о страсти, притяжении, инициативе и темпе развития отношений.",
      },
      {
        q: "Жезлы в карьере",
        a: "Масть указывает на проекты, амбиции, рост и активные шаги в профессиональной сфере.",
      },
    ],
  },
  {
    slug: "pentakli",
    suit: "pentacles",
    titleRu: "Пентакли",
    titleGenitive: "Пентаклей",
    element: "Земля · материя и ресурсы",
    seoTitle: "Пентакли в Таро — значение масти и все 14 карт | Zovus",
    seoDescription:
      "Пентакли в Таро: значение масти денег, работы и стабильности. Все 14 карт Пентаклей с толкованием — справочник Zovus.",
    h1: "Пентакли в Таро: значение масти",
    intro:
      "Пентакли отражают материальный мир: финансы, здоровье, быт и практичные результаты. В раскладах — про стабильность и ресурсы.",
    faq: [
      {
        q: "Пентакли в финансовом раскладе",
        a: "Масть показывает доход, инвестиции, практичные шаги и материальную опору.",
      },
      {
        q: "Пентакли в отношениях",
        a: "Карты говорят о надёжности, быте, совместных планах и заземлённой любви.",
      },
    ],
  },
];

export function getSuitHubBySlug(slug: string): SuitHubConfig | undefined {
  return SUIT_HUBS.find((h) => h.slug === slug);
}

export function getAllSuitHubSlugs(): string[] {
  return SUIT_HUBS.map((h) => h.slug);
}

export function getCardsForSuit(suit: SuitHubConfig["suit"]): TarotCard[] {
  return FULL_DECK.filter((c) => c.suit === suit);
}

export function getSuitHubForCard(card: TarotCard): SuitHubConfig | undefined {
  if (!card.suit) return undefined;
  return SUIT_HUBS.find((h) => h.suit === card.suit);
}

export function getCardLinksForSuit(suit: SuitHubConfig["suit"]) {
  return getCardsForSuit(suit).map((c) => ({
    name: c.name,
    slug: cardSeoSlug(c),
    meaning: c.meaning,
  }));
}
