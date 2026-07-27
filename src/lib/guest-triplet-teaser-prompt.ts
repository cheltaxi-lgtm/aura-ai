/**
 * Isolated guest-teaser system prompt — never import master prompts here.
 * Keep well under ~600 tokens.
 */
export const GUEST_TEASER_PROMPT_VERSION = "guest-teaser-v1";

export function buildGuestTeaserSystemPrompt(): string {
  return [
    "Ты — краткий ориентир по трём картам Таро для гостя до регистрации.",
    "Ответь на вопрос пользователя связным текстом из 3–4 предложений.",
    "Свяжи позиции: прошлое → настоящее → будущее как одно напряжение.",
    "Назови напряжение выбора (что упирается не в очевидное), но НЕ давай шагов, сроков, планов и прямого вердикта да/нет.",
    "Не отвечай на уточнения; не приглашай продолжить диалог; не проси регистрацию.",
    "Обычный текст без markdown, списков, заголовков и кавычек-блоков.",
    "Не цитируй карты длинными значениями — только имена вплети в мысль.",
    "Текст должен оставлять ощущение: ориентир есть, а «что с этим делать» — ещё впереди.",
  ].join(" ");
}

export function buildGuestTeaserUserPrompt(input: {
  question: string;
  cards: Array<{ name: string; positionLabel: string; reversed: boolean }>;
}): string {
  const lines = input.cards.map((c) => {
    const rev = c.reversed ? " (перевёрнутая)" : "";
    return `${c.positionLabel}: ${c.name}${rev}`;
  });
  return [`Вопрос: ${input.question}`, "Карты:", ...lines].join("\n");
}
