/** A joint invite has two independent readings. The first one cannot establish compatibility. */
export function jointRelationLabel(intentSlug: string): string {
  if (intentSlug === "sovmestimost-druzhba") return "дружба";
  if (intentSlug === "sovmestimost-biznes") return "деловое партнёрство";
  return "отношения";
}

export function buildJointPersonalPrompt(input: {
  intentSlug: string;
  otherDone: boolean;
  positions: string[];
}): string {
  const positions = input.positions.map((position, i) => `${i + 1}. ${position}`).join("; ");
  return `
ОСОБЫЙ ФОРМАТ: ЛИЧНАЯ ЧАСТЬ СОВМЕСТНОГО РАСКЛАДА.
  Это личное чтение одного участника. ${input.otherDone ? "Расклад второго участника уже готов; общий вывод будет собран после сохранения этой части." : "Второй участник ещё не вытянул свои карты."} Тема приглашения — ${jointRelationLabel(input.intentSlug)}.
Предыдущие общие правила о вердикте по паре, длине в 28–40 предложений и финальном прогнозе здесь НЕ применяются.
- Не оценивай совместимость, чувства, характер, намерения или поступки второго участника как установленный факт. Даже позиция «Партнёр» отражает лишь символический взгляд текущего участника на эту сторону связи.
- Не пиши «вы совместимы», «совместимость высокая/низкая», «быть парой стоит», «партнёр тоже ...» и не выдавай окончательный итог союза. Общий вывод появится только после второй личной части.
- Начни с двух точных предложений о том, что видно в картах этого участника, без слова «Вердикт». Затем пройди все ${input.positions.length} позиции в порядке: ${positions}.
- Для каждой позиции выведи отдельный заголовок «### Позиция · Название карты» и один абзац из 2–3 коротких предложений: образ карты, его смысл именно в позиции и практический вопрос или наблюдение для текущего участника. Не повторяй один вывод в разных картах.
  - Закончи блоком «## Что взять с собой»: 2–3 предложения о действиях самого участника. ${input.otherDone ? "Укажи, что общий вывод будет собран после сохранения этой части." : "Укажи, что для общего вывода нужен расклад второго человека."}
- Пиши грамотно, обращайся к одному человеку последовательно на «ты». Не смешивай единственное и множественное число; если сложно, используй нейтральные конструкции без местоимений. Не используй звёздочки Markdown, списки или декоративные символы. Объём 1400–2200 знаков.
`;
}

/** Reject answers that promise a bilateral result before the other person has participated. */
export function jointPersonalQualityIssue(text: string, cardCount = 0): string | null {
  if (/(?<![\p{L}\p{N}])совместимость\s+(?:высок|низк|сильн|слаб|хорош|плох)\p{L}*/iu.test(text)) return "premature_compatibility_verdict";
  if (/(?<![\p{L}\p{N}])(?:вы|ты)\s+совместим\p{L}*/iu.test(text)) return "premature_compatibility_verdict";
  if (/(?<![\p{L}\p{N}])(?:ты\s+(?:способны|совместимы)|один\s+из\s+тебя)(?![\p{L}\p{N}])/iu.test(text)) return "broken_person_agreement";
  if (cardCount) {
    if (text.trim().length < 1100) return "too_short";
    const sections = text.match(/^(?:###\s+[^\n]+|\*\*[^*\n]{2,110}\*\*)/gmu) ?? [];
    if (sections.length < cardCount) return "missing_card_sections";
    if (!/^##\s+(?:Что взять с собой|Простыми словами)/imu.test(text)) return "missing_closing";
  }
  return null;
}

export function jointCombinedQualityIssue(text: string): string | null {
  if (text.trim().length < 1100) return "too_short";
  for (const heading of ["Суть связи", "Что поддерживает", "Что мешает", "Что делать дальше"]) {
    if (!text.split("\n").some((line) => line.trim().toLocaleLowerCase("ru-RU") === `## ${heading.toLocaleLowerCase("ru-RU")}`)) {
      return "missing_sections";
    }
  }
  if (/(?<![\p{L}\p{N}])(?:ты\s+оба|твои\s+отношения\s+вдвоём)(?![\p{L}\p{N}])/iu.test(text)) return "broken_plural_address";
  return null;
}
