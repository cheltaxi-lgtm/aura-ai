import type { SpreadSymbol } from "@/lib/decks/types";

export function buildSpreadTeaser(params: {
  userName: string;
  cards: Pick<SpreadSymbol, "name">[];
  positions: string[];
  masterName?: string | null;
}): string {
  const { userName, cards, positions, masterName } = params;
  const trio = cards.slice(0, 3);
  if (trio.length < 3) {
    return masterName
      ? `${userName}, продолжите с ${masterName}, чтобы услышать полную расшифровку.`
      : `${userName}, выберите наставника для полной расшифровки.`;
  }

  const parts = trio
    .map((c, i) => `«${c.name}» (${positions[i] ?? `карта ${i + 1}`})`)
    .join(", ");
  const dominant = trio[1]?.name ?? trio[0].name;
  const cta = masterName
    ? `Продолжите с ${masterName}, чтобы услышать полную расшифровку.`
    : `Выберите наставника, чтобы услышать полную расшифровку.`;

  return `${userName}, три символа легли на ваш астральный стол: ${parts}. Энергия ${dominant} сейчас доминирует — ${cta}`;
}
