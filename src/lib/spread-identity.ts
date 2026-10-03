/** Versioned identity for validated cards. Array order is the spread position. */
export function spreadIdentityKey(
  deckSystem: string,
  cards: readonly { id: number; reversed: boolean }[]
): string {
  if (!deckSystem || !cards.length) return "";
  return `cards:v2:${JSON.stringify([deckSystem, cards.map(card => [card.id, card.reversed])])}`;
}
