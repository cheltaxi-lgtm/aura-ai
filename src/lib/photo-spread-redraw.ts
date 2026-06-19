import type { DeckSystem } from "@/lib/decks/types";
import {
  findSymbolByName,
  getDeckPositions,
  resolveMasterDeckSystem,
} from "@/lib/decks";
import { getDeckImagePath, DECK_BACK_PATHS } from "@/data/decks";
import { getSymbolDescription } from "@/data/descriptions";

export interface RedrawSpreadCard {
  name: string;
  reversed: boolean;
  position: string;
  imagePath: string;
  shortMeaning: string;
  placeholder: boolean;
  order: number;
}

export interface RedrawSpread {
  system: DeckSystem;
  deckType?: string;
  spreadType?: string;
  cards: RedrawSpreadCard[];
}

const REVERSED_MARKERS = /\(перев\.?\)|\(reversed\)|\(rev\.?\)|перев\.?/i;

export function parseCardOrientation(raw: string): { name: string; reversed: boolean } {
  let text = raw.replace(/[«»"']/g, "").trim();
  const reversed = REVERSED_MARKERS.test(text);
  text = text
    .replace(REVERSED_MARKERS, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { name: text, reversed };
}

export function resolvePhotoDeckSystem(
  deckType: string | undefined,
  masterId: string
): DeckSystem {
  const masterSystem = resolveMasterDeckSystem(masterId);
  const text = (deckType ?? "").toLowerCase();

  if (/рун|futhark| elder|runes/i.test(text)) return "runes";
  if (/слав|ved|reza|род|slavic/i.test(text)) return "slavic";
  if (/астр|джйотиш|jyotish|знак|planet|vedic/i.test(text)) return "astrology";
  if (/таро|tarot|rider|lenorman|оракул|oracle|мarseille|марсель/i.test(text)) {
    if (masterId === "gadalka_marina") return "tarot-marina";
    if (masterSystem === "tarot-marina" || masterSystem === "tarot-veronika") {
      return masterSystem;
    }
    return "tarot-veronika";
  }

  return masterSystem;
}

export function inferSpreadPositions(
  count: number,
  system: DeckSystem,
  spreadType?: string
): string[] {
  const defaults = [...getDeckPositions(system)];
  if (count <= defaults.length) {
    return defaults.slice(0, count);
  }

  const numbered = Array.from({ length: count }, (_, i) => `Позиция ${i + 1}`);
  const spread = (spreadType ?? "").toLowerCase();

  if (/прошл|настоя|будущ/i.test(spread) && count >= 3) {
    return ["Прошлое", "Настоящее", "Будущее", ...numbered.slice(3)].slice(0, count);
  }

  return numbered;
}

function isPlaceholderArt(system: DeckSystem, name: string, imagePath: string): boolean {
  if (imagePath !== DECK_BACK_PATHS[system]) return false;
  return !findSymbolByName(system, name);
}

export function mapDetectedToRedrawSpread(params: {
  detectedCards: string[];
  system: DeckSystem;
  deckType?: string;
  spreadType?: string;
  positions?: string[];
}): RedrawSpread {
  const { detectedCards, system, deckType, spreadType } = params;
  const positions =
    params.positions ??
    inferSpreadPositions(detectedCards.length, system, spreadType);

  const cards: RedrawSpreadCard[] = detectedCards.map((raw, index) => {
    const { name, reversed } = parseCardOrientation(raw);
    const symbol = findSymbolByName(system, name);
    const imagePath = getDeckImagePath(system, name);
    const desc = getSymbolDescription(system, symbol?.name ?? name);

    return {
      name: symbol?.name ?? name,
      reversed,
      position: positions[index] ?? `Позиция ${index + 1}`,
      imagePath,
      shortMeaning: desc.shortMeaning || symbol?.meaning || "",
      placeholder: isPlaceholderArt(system, name, imagePath),
      order: index,
    };
  });

  return { system, deckType, spreadType, cards };
}

export function redrawSpreadToTarotCards(spread: RedrawSpread) {
  return spread.cards.map((c) => ({
    name: c.reversed ? `${c.name} (перев.)` : c.name,
    meaning: c.shortMeaning,
    reversed: c.reversed,
    position: c.position,
    imagePath: c.imagePath,
    placeholder: c.placeholder,
  }));
}

export function isRecognizedSpread(params: {
  detectedCards: string[];
  deckType?: string;
  spreadType?: string;
}): { ok: boolean; reason?: string } {
  const { detectedCards, deckType, spreadType } = params;

  if (!detectedCards.length) {
    return { ok: false, reason: "На фото не удалось распознать карты или символы расклада." };
  }

  const joined = detectedCards.join(" ").toLowerCase();
  if (/не удалось|не распозн|не определ/i.test(joined)) {
    return { ok: false, reason: "Это не похоже на расклад — загрузите фото карт или рун в кадре." };
  }

  const deck = (deckType ?? "").toLowerCase();
  if (/не определена|неизвест/i.test(deck) && detectedCards.length < 2) {
    return {
      ok: false,
      reason: "Не удалось определить колоду. Сделайте фото при хорошем свете — все символы в кадре.",
    };
  }

  if ((spreadType ?? "").toLowerCase().includes("не распознан") && detectedCards.length < 2) {
    return { ok: false, reason: "Расклад не распознан. Попробуйте другое фото или выберите символы вручную." };
  }

  return { ok: true };
}

export function buildSpreadSummaryForLlm(spread: RedrawSpread): string {
  const lines = spread.cards.map(
    (c, i) =>
      `${i + 1}. ${c.position}: «${c.name}»${c.reversed ? " (перевёрнутая)" : ""}${
        c.placeholder ? " [нет точного арта Aura — читай по названию]" : ""
      }`
  );
  return [
    `Система Aura: ${spread.system}`,
    spread.deckType ? `Колода на фото: ${spread.deckType}` : "",
    spread.spreadType ? `Схема: ${spread.spreadType}` : "",
    `Подтверждённые символы (${spread.cards.length}):`,
    ...lines,
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeRedrawSpreadInput(
  input: {
    system: DeckSystem;
    deckType?: string;
    spreadType?: string;
    cards: Array<{
      name: string;
      reversed?: boolean;
      position?: string;
      order?: number;
    }>;
  },
  masterId: string
): RedrawSpread {
  const system = input.system ?? resolvePhotoDeckSystem(input.deckType, masterId);
  const detected = input.cards.map((c) =>
    c.reversed ? `${c.name} (перев.)` : c.name
  );
  const positions = input.cards.map((c, i) => c.position ?? `Позиция ${i + 1}`);
  const spread = mapDetectedToRedrawSpread({
    detectedCards: detected,
    system,
    deckType: input.deckType,
    spreadType: input.spreadType,
    positions,
  });
  return {
    ...spread,
    cards: spread.cards.map((c, i) => ({
      ...c,
      order: input.cards[i]?.order ?? i,
      reversed: input.cards[i]?.reversed ?? c.reversed,
      position: input.cards[i]?.position ?? c.position,
    })),
  };
}

export const DECK_SYSTEM_DISPLAY: Record<DeckSystem, string> = {
  runes: "Скандинавские руны",
  "tarot-veronika": "Таро и Психология",
  "tarot-marina": "Таро",
  slavic: "Славянское ведовство",
  astrology: "Джйотиш / Астрология",
};
