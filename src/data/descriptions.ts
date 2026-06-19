/**
 * Per-system Russian symbol descriptions — single source for spread + gallery.
 * shortMeaning mirrors deck draw logic; fullMeaning + keywords for detail modal.
 */

import type { DeckSystem } from "@/lib/decks/types";
import { DECK_REGISTRY } from "@/lib/decks";

export interface SymbolDescription {
  shortMeaning: string;
  fullMeaning: string;
  keywords: string[];
}

const SYSTEM_INTRO: Record<DeckSystem, string> = {
  runes:
    "В традиции Старшего Футарка эта руна отражает северную мудрость — суровую, прямую и точную.",
  "tarot-veronika":
    "В колоде Rider-Waite этот аркан раскрывает психологический и духовный слой ситуации.",
  "tarot-marina":
    "В лунной колоде Марины символ звучит мягко и глубоко — через интуицию и циклы Луны.",
  slavic:
    "В системе Рез Рода этот знак связан с древнерусской магией, родом и силой предков.",
  astrology:
    "В джйотиш этот граха или раши описывает кармический узор и энергию небес.",
};

function keywordsFromMeaning(meaning: string): string[] {
  return meaning
    .split(/[,;·]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function buildFullMeaning(system: DeckSystem, name: string, short: string): string {
  const intro = SYSTEM_INTRO[system];
  return `${name} — ${short}. ${intro} Прислушайтесь к этому знаку: он подсказывает, куда направить внимание сегодня и какие качества активировать в себе.`;
}

function buildDescriptionMap(system: DeckSystem): Record<string, SymbolDescription> {
  const out: Record<string, SymbolDescription> = {};
  for (const symbol of DECK_REGISTRY[system].symbols) {
    const short = symbol.meaning.trim();
    out[symbol.name] = {
      shortMeaning: short,
      fullMeaning: buildFullMeaning(system, symbol.name, short),
      keywords: keywordsFromMeaning(short),
    };
  }
  return out;
}

export const DECK_DESCRIPTIONS: Record<DeckSystem, Record<string, SymbolDescription>> = {
  runes: buildDescriptionMap("runes"),
  "tarot-veronika": buildDescriptionMap("tarot-veronika"),
  "tarot-marina": buildDescriptionMap("tarot-marina"),
  slavic: buildDescriptionMap("slavic"),
  astrology: buildDescriptionMap("astrology"),
};

export function normalizeDescName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function getSymbolDescription(
  system: DeckSystem,
  name: string
): SymbolDescription {
  const key = normalizeDescName(name);
  const map = DECK_DESCRIPTIONS[system];
  if (map[key]) return map[key];
  const relaxed = key.replace(/ё/g, "е");
  for (const [k, v] of Object.entries(map)) {
    if (k.replace(/ё/g, "е") === relaxed) return v;
  }
  return {
    shortMeaning: "",
    fullMeaning: `${name} — символ колоды. Подробное описание скоро появится.`,
    keywords: [],
  };
}

export default DECK_DESCRIPTIONS;
