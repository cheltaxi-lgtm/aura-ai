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

/** Short per-position preview (legacy dictionary layout — avoid showing to guests). */
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

/**
 * Non-dictionary silent fallback when LLM is unavailable.
 * Keeps question + all three card names; never uses Past/Present/Future scaffold.
 */
export function buildGuestNarrativeFallback(
  question: string,
  cards: Array<{ name: string; meaning?: string }>
): string {
  const q = question.trim().replace(/\s+/g, " ").slice(0, 140) || "ваш вопрос";
  const motifs = cards.slice(0, 3).map((card) => {
    const hint =
      firstSnippet(card.meaning, 48) || "символ уже открыт";
    return `«${card.name}» — ${hint.replace(/\.$/, "")}`;
  });
  if (motifs.length < 3) {
    return `По вопросу «${q}» карты уже зафиксированы. Полный разбор именно этих карт — после входа.`;
  }
  return `По вопросу «${q}» сейчас в раскладе ${motifs[0]}; ${motifs[1]}; ${motifs[2]}. Связный разбор именно этих трёх карт по вашему вопросу откроется после входа — пересчёта не будет.`;
}
