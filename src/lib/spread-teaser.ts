import type { SpreadSymbol } from "@/lib/decks/types";

function symbolCountPhrase(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let word = "символов";
  if (mod100 >= 11 && mod100 <= 14) {
    word = "символов";
  } else if (mod10 === 1) {
    word = "символ";
  } else if (mod10 >= 2 && mod10 <= 4) {
    word = "символа";
  }
  return `${n} ${word}`;
}

export function buildSpreadTeaser(params: {
  userName: string;
  cards: Pick<SpreadSymbol, "name">[];
  positions: string[];
  masterName?: string | null;
}): string {
  const { userName, cards, positions, masterName } = params;
  const limit = positions.length > 0 ? Math.min(cards.length, positions.length) : cards.length;
  const shown = cards.slice(0, limit);
  if (shown.length === 0) {
    return masterName
      ? `${userName}, продолжите с ${masterName}, чтобы услышать полную расшифровку.`
      : `${userName}, выберите наставника для полной расшифровки.`;
  }

  const parts = shown
    .map((c, i) => `«${c.name}» (${positions[i] ?? `карта ${i + 1}`})`)
    .join(", ");
  const dominant = shown[Math.floor((shown.length - 1) / 2)]?.name ?? shown[0].name;
  const cta = masterName
    ? `Продолжите с ${masterName}, чтобы услышать полную расшифровку.`
    : `Выберите наставника, чтобы услышать полную расшифровку.`;
  const verb = shown.length === 1 ? "лёг" : "легли";

  return `${userName}, ${symbolCountPhrase(shown.length)} ${verb} на ваш астральный стол: ${parts}. Энергия ${dominant} сейчас доминирует — ${cta}`;
}
