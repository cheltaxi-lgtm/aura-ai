export type JointDisplayCard = { name: string; position?: string };

export type JointPersonalDisplay = {
  opening: string;
  cards: Array<JointDisplayCard & { text: string }>;
  closing: string;
};

function clean(text: string): string {
  return text
    .replace(/\*{1,2}/g, "")
    .replace(/^#{1,3}\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match a saved card section by the actual draw, never by a model-invented label. */
function cardIndex(paragraph: string, cards: JointDisplayCard[]): number {
  const head = paragraph.slice(0, 110).replace(/^\s*(?:#{1,3}\s*)?\*{0,2}/, "").toLocaleLowerCase("ru-RU");
  return cards.findIndex((card) => head.includes(card.name.toLocaleLowerCase("ru-RU")));
}

/** Both old **Card — position.** and new heading-based prose become real UI sections. */
export function parseJointPersonalReading(
  content: string,
  cards: JointDisplayCard[]
): JointPersonalDisplay | null {
  if (!cards.length || !content.trim()) return null;
  const paragraphs = content.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const opening: string[] = [];
  const closing: string[] = [];
  const bodies = cards.map(() => "");
  let active = -1;
  let afterCards = false;

  for (const paragraph of paragraphs) {
    const startsAsCard = /^(?:#{2,3}\s+|\*\*)/.test(paragraph);
    const index = startsAsCard ? cardIndex(paragraph, cards) : -1;
    if (index >= 0) {
      active = index;
      const withoutHeading = paragraph
        .replace(/^\*\*[^*\n]{2,110}\*\*\s*/, "")
        .replace(/^#{2,3}\s+[^\n]+\n?\s*/, "");
      bodies[index] = clean(withoutHeading);
      continue;
    }
    if (/^#{1,3}\s|^\*\*(?:Простыми словами|Что взять с собой|Итог|Вывод)/iu.test(paragraph)) {
      afterCards = active >= 0;
      const headingTail = paragraph.replace(/^(?:#{1,3}\s+[^\n]+|\*\*[^*\n]+\*\*)\s*\n?/u, "").trim();
      if (afterCards && headingTail) closing.push(clean(headingTail));
      continue;
    }
    if (afterCards) closing.push(clean(paragraph));
    else if (active >= 0) bodies[active] = [bodies[active], clean(paragraph)].filter(Boolean).join(" ");
    else opening.push(clean(paragraph));
  }

  if (bodies.some((body) => !body)) return null;
  return {
    opening: opening.join(" ").replace(/^Вердикт:\s*/iu, ""),
    cards: cards.map((card, index) => ({ ...card, text: bodies[index]! })),
    closing: closing.join(" "),
  };
}
