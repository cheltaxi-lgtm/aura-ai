import type { SpreadIntentDefinition } from "@/lib/spread-intents/types";

export type IntentFaqItem = { q: string; a: string };

/** Per-intent FAQ for unique schema and on-page content (not shared across 590 pages). */
export function buildIntentFaq(intent: SpreadIntentDefinition): IntentFaqItem[] {
  const q = intent.questionTemplate.replace(/\.\s*$/, "");
  return [
    {
      q: `${q}?`,
      a: `${intent.intro} Расклад «${intent.title}» использует схему из ${intent.positionsPreview.length} позиций — мастер свяжет их в связный ответ с учётом вашего вопроса.`,
    },
    {
      q: `Какой расклад подходит для «${intent.title}»?`,
      a: `Для этой темы мы используем проверенную схему: ${intent.positionsPreview.slice(0, 3).join(", ")}${intent.positionsPreview.length > 3 ? " и другие позиции" : ""}. Мастер ${intent.recommendedMasterId === "veronika" ? "Вероника" : "Zovus"} проведёт трактовку в чате.`,
    },
    {
      q: "Можно ли задать уточняющий вопрос после расклада?",
      a: "Да. После расшифровки вы продолжаете диалог с мастером — можно уточнить детали, переспросить позицию или связать ответ с вашей ситуацией.",
    },
    {
      q: "Сохраняется ли история расклада?",
      a: "После регистрации сеансы и переписка сохраняются в личном кабинете. Вы можете вернуться к трактовке в любой момент.",
    },
    {
      q: "Это гарантия результата?",
      a: "Нет. Расклад показывает энергию ситуации и возможные сценарии, а не предсказание с точной датой. Подробнее — в разделе об ограничениях интерпретации.",
    },
  ];
}

export function intentFaqJsonLd(items: IntentFaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
