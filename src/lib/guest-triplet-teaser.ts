import type { SpreadSymbol } from "@/lib/decks/types";

function firstSnippet(text: string | undefined, maxLen = 100): string {
  if (!text?.trim()) return "";
  const trimmed = text.trim();
  const sentence = trimmed.split(/(?<=[.!?])\s+/)[0] ?? trimmed;
  if (sentence.length <= maxLen) return sentence;
  return `${sentence.slice(0, maxLen - 1).trim()}…`;
}

/** One-line card names for storage / share. */
export function buildGuestTripletTeaser(cards: SpreadSymbol[]): string {
  const names = cards
    .slice(0, 3)
    .map((c) => `«${c.name}»`)
    .join(" · ");
  return `Три карты легли на ваш стол: ${names}. Ниже — краткий ориентир по символам; полная связная расшифровка — после регистрации.`;
}

/** Short per-position preview shown before registration gate. */
export function buildGuestTripletPreview(
  cards: SpreadSymbol[],
  positions: readonly string[]
): string {
  return cards
    .slice(0, 3)
    .map((card, i) => {
      const pos = positions[i] ?? `Позиция ${i + 1}`;
      const snippet = firstSnippet(card.meaning) || "символ открыт — смотрите значение на карте.";
      return `${pos}: «${card.name}» — ${snippet}`;
    })
    .join("\n\n");
}
