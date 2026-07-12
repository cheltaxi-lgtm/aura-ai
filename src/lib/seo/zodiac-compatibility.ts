import { SEO_ZODIAC_SIGNS, type SeoZodiacSign } from "./zodiac-signs";

export type ZodiacElement = SeoZodiacSign["element"];

const ELEMENT_LABELS: Record<ZodiacElement, string> = {
  fire: "Огонь",
  earth: "Земля",
  air: "Воздух",
  water: "Вода",
};

const ELEMENT_PAIR_TEXT: Record<string, string> = {
  "fire-fire":
    "Двойной Огонь — это страсть, скорость и вечное соревнование за первенство. Пара заряжает друг друга энергией и легко срывается в новые проекты, но обоим нужно учиться уступать и не соревноваться в мелочах.",
  "fire-earth":
    "Огонь и Земля — классика «вдохновение плюс опора»: один придумывает и загорается, другой планирует и доводит до результата. Конфликт возникает, если Земля тормозит слишком сильно, а Огонь — обесценивает стабильность.",
  "fire-air":
    "Огонь и Воздух усиливают друг друга — Воздух подкидывает идеи, Огонь превращает их в действие. Легкий, динамичный союз, но обоим не хватает «якоря»: важно осознанно строить бытовую стабильность.",
  "fire-water":
    "Самое непростое сочетание элементов: Огонь высушивает Воду, Вода гасит Огонь. Отношения эмоционально насыщенные и притягательные, но требуют бережности — Вода легко обижается на прямоту Огня, а Огонь — на эмоциональные качели партнёра.",
  "earth-earth":
    "Двойная Земля — надёжный, предсказуемый союз с общими взглядами на быт, деньги и распорядок. Плюс — стабильность, минус — риск застрять в рутине без совместного развития и новых впечатлений.",
  "earth-air":
    "Земля и Воздух смотрят на мир по-разному: одному важна конкретика и порядок, другому — свобода и смена картинки. При взаимном уважении к разнице темпераментов пара хорошо балансирует практичность и лёгкость.",
  "earth-water":
    "Земля и Вода — мягкое, заботливое сочетание: Земля даёт опору, Вода — эмоциональную глубину и интуицию. Один из самых гармоничных дуэтов для долгосрочных отношений и семьи.",
  "air-air":
    "Двойной Воздух — союз идей, разговоров и лёгкости, но часто без глубины и бытовой устойчивости. Хорошо для дружбы и партнёрства в делах, в романтике важно осознанно строить эмоциональную близость.",
  "air-water":
    "Воздух и Вода — сочетание логики и чувств: один рационализирует, другой чувствует. Может быть очень гармоничным, если Воздух не обесценивает эмоции партнёра, а Вода не тонет в обидах на его прямоту.",
  "water-water":
    "Двойная Вода — глубокая эмоциональная связь, интуитивное понимание друг друга без слов. Риск — совместное «утопание» в переживаниях без рационального взгляда на бытовые вопросы.",
};

function pairKey(a: ZodiacElement, b: ZodiacElement): string {
  const order: ZodiacElement[] = ["fire", "earth", "air", "water"];
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  return ia <= ib ? `${a}-${b}` : `${b}-${a}`;
}

export function elementCompatibilityText(a: ZodiacElement, b: ZodiacElement): string {
  return ELEMENT_PAIR_TEXT[pairKey(a, b)] ?? "";
}

export function elementLabel(element: ZodiacElement): string {
  return ELEMENT_LABELS[element];
}

/** Best-match elements for a given element, in priority order (same element, then complementary). */
const BEST_MATCH_ELEMENTS: Record<ZodiacElement, ZodiacElement[]> = {
  fire: ["fire", "air"],
  earth: ["earth", "water"],
  air: ["air", "fire"],
  water: ["water", "earth"],
};

export function bestMatchSignsFor(sign: SeoZodiacSign): SeoZodiacSign[] {
  const priority = BEST_MATCH_ELEMENTS[sign.element];
  return SEO_ZODIAC_SIGNS.filter((s) => s.slug !== sign.slug && priority.includes(s.element)).sort(
    (a, b) => priority.indexOf(a.element) - priority.indexOf(b.element)
  );
}

export const ELEMENT_PAIRS: { a: ZodiacElement; b: ZodiacElement }[] = [
  { a: "fire", b: "fire" },
  { a: "fire", b: "earth" },
  { a: "fire", b: "air" },
  { a: "fire", b: "water" },
  { a: "earth", b: "earth" },
  { a: "earth", b: "air" },
  { a: "earth", b: "water" },
  { a: "air", b: "air" },
  { a: "air", b: "water" },
  { a: "water", b: "water" },
];
