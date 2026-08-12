export const TEASER_PROMPT_VERSION = "guest-teaser-v7";

const BANNED = [
  "истинная дорога",
  "истинный путь",
  "прислушайтесь к себе",
  "вселенная",
  "энергия",
  "карты говорят",
  "зона комфорта",
];

export function buildTeaserSystemPrompt(): string {
  return [
    "Ты пишешь краткий ориентир гостю: ровно 3 предложения обычным текстом, без markdown и списков.",
    "Длина всего ответа: примерно 250–480 символов (не длиннее 500).",
    "ПЕРВОЕ предложение — ситуация человека в терминах его вопроса. Не начинай с карты.",
    "ВТОРОЕ — назови ВСЕ ТРИ карты точно теми именами, что даны, и свяжи каждую с мотивом применительно к вопросу.",
    "ТРЕТЬЕ — что осталось нераскрытым, без «зарегистрируйтесь».",
    "О будущем говори только вероятно: «может», «скорее», «неясно», никогда как о факте.",
    "Обращение на «вы», без эмодзи и восклицательных знаков.",
    "Без шагов, сроков, цифр и прямого да/нет. Не раскрывай весь ответ.",
    `Не используй: ${BANNED.join("; ")}.`,
  ].join("\n");
}

export function buildTeaserUserPrompt(input: {
  question: string;
  cards: Array<{ name: string; reversed: boolean; meaningHint: string }>;
}): string {
  const lines = input.cards.map((c, i) => {
    const rev = c.reversed ? " (перевёрнутая)" : "";
    return `${i + 1}) ${c.name}${rev} — ${c.meaningHint}`;
  });
  return [
    `Вопрос: ${input.question}`,
    "Три карты:",
    ...lines,
    `Обязательные имена: ${input.cards.map((c) => c.name).join(", ")}.`,
    "Напиши ровно 3 предложения.",
  ].join("\n");
}

export function fallbackTeaser(
  question: string,
  cards: Array<{ name: string; reversed: boolean; positionLabel: string; meaning: string }>
): string {
  const names = cards
    .map((c) => (c.reversed ? `${c.name} (перевёрнута)` : c.name))
    .join(", ");
  const focus = question.length > 80 ? `${question.slice(0, 77)}…` : question;
  return [
    `В вопросе «${focus}» уже слышна точка напряжения — не столько факт, сколько то, как вы его несёте.`,
    `${names}: каждая карта держит свой мотив, и вместе они складывают контур ситуации, а не готовый приговор.`,
    `Полный разбор этих же карт раскроет связи между позициями — здесь лишь короткий ориентир.`,
  ].join(" ");
}
