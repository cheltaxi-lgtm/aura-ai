import type { TarotCard } from "@/lib/tarot";

export type CardFaqItem = { question: string; answer: string };

export function buildCardFaq(card: TarotCard, reversed?: string): CardFaqItem[] {
  const items: CardFaqItem[] = [
    {
      question: `Что означает карта «${card.name}» в Таро?`,
      answer: `${card.name} — ${card.meaning}. В раскладе значение уточняется позицией и соседними картами.`,
    },
    {
      question: `Карта «${card.name}» в любви`,
      answer: `В вопросах отношений «${card.name}» раскрывает эмоциональный или энергетический аспект связи — от чувств до препятствий.`,
    },
  ];

  if (reversed) {
    items.push({
      question: `Что означает перевёрнутая «${card.name}»?`,
      answer: reversed,
    });
  } else {
    items.push({
      question: `Есть ли перевёрнутое значение у «${card.name}»?`,
      answer:
        "Да. Перевёрнутая карта часто указывает на блок, страх или внутреннее сопротивление теме аркана.",
    });
  }

  items.push({
    question: `Как использовать «${card.name}» в раскладе?`,
    answer:
      "Выберите готовый вопрос в каталоге Zovus или задайте свой — мастер свяжет карту с вашей ситуацией в трактовке.",
  });

  return items;
}
