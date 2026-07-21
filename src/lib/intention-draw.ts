import {
  DECK_REGISTRY,
  findSymbolByName,
  getDeckPositions,
  resolveMasterDeckSystem,
  type DeckSystem,
} from "@/lib/decks";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { SessionIntention } from "@/lib/intention";
import { createSeededRng, type SpreadRng } from "@/lib/spread-seed";

export type DrawIntention = SessionIntention | "life_death";

const LENORMAND_LOVE = ["Сердце", "Кольцо", "Букет", "Собака", "Лилия", "Аист", "Солнце"];
const LENORMAND_MONEY = ["Рыбы", "Клевер", "Якорь", "Корабль", "Ключ", "Солнце", "Медведь"];
const LENORMAND_SIGN = ["Звёзды", "Ключ", "Солнце", "Луна", "Книга", "Всадник", "Птицы"];

/** Preferred symbols per intention — biased draw, not a fixed spread. */
const INTENTION_PREFERRED: Record<
  DrawIntention,
  Partial<Record<DeckSystem, string[]>>
> = {
  Любовь: {
    runes: ["Гебо", "Вуньо", "Беркана", "Эваз", "Ингуз", "Лагуз"],
    "tarot-veronika": [
      "Влюблённые",
      "Императрица",
      "Туз Кубков",
      "2 Кубков",
      "3 Кубков",
      "9 Кубков",
      "10 Кубков",
      "Королева Кубков",
      "Рыцарь Кубков",
    ],
    "tarot-marina": [
      "Влюблённые",
      "Императрица",
      "Туз Кубков",
      "2 Кубков",
      "3 Кубков",
      "9 Кубков",
      "10 Кубков",
      "Королева Кубков",
    ],
    slavic: ["Леля", "Берегиня", "Даждьбог", "Уд"],
    astrology: ["Шукра", "Чандра", "Гуру"],
    lenormand: LENORMAND_LOVE,
  },
  Деньги: {
    runes: ["Феху", "Йера", "Райдо", "Соулу", "Отал"],
    "tarot-veronika": [
      "Туз Пентаклей",
      "9 Пентаклей",
      "10 Пентаклей",
      "Король Пентаклей",
      "Королева Пентаклей",
      "Императрица",
      "Колесо Фортуны",
      "6 Пентаклей",
      "8 Пентаклей",
    ],
    "tarot-marina": [
      "Туз Пентаклей",
      "9 Пентаклей",
      "10 Пентаклей",
      "Король Пентаклей",
      "Императрица",
      "Колесо Фортуны",
    ],
    slavic: ["Даждьбог", "Уд", "Опора"],
    astrology: ["Гуру", "Шукра", "Шани"],
    lenormand: LENORMAND_MONEY,
  },
  Здоровье: {
    runes: ["Уруз", "Соулу", "Беркана", "Ингуз", "Альгиз"],
    "tarot-veronika": [
      "Сила",
      "Солнце",
      "Звезда",
      "Императрица",
      "4 Мечей",
      "Умеренность",
      "Мир",
    ],
    "tarot-marina": ["Сила", "Солнце", "Звезда", "Императрица", "4 Мечей", "Умеренность"],
    slavic: ["Берегиня", "Сила", "Есть"],
    astrology: ["Сурья", "Чандра", "Гуру"],
  },
  "Мой путь": {
    runes: ["Райдо", "Ансуз", "Перт", "Дагаз", "Манназ"],
    "tarot-veronika": [
      "Отшельник",
      "Колесо Фортуны",
      "Суд",
      "Звезда",
      "Иерофант",
      "Маг",
      "Мир",
    ],
    "tarot-marina": ["Отшельник", "Колесо Фортуны", "Суд", "Звезда", "Иерофант", "Маг"],
    slavic: ["Алатырь", "Исток", "Рок"],
    astrology: ["Гуру", "Кету", "Раху"],
  },
  Враги: {
    runes: ["Турисаз", "Тейваз", "Иса", "Хагалаз", "Наутиз", "Эйваз"],
    "tarot-veronika": [
      "5 Мечей",
      "7 Мечей",
      "9 Мечей",
      "10 Мечей",
      "3 Мечей",
      "Дьявол",
      "Башня",
      "5 Жезлов",
      "7 Жезлов",
      "Справедливость",
      "Сила",
      "Император",
      "Повешенный",
    ],
    "tarot-marina": [
      "5 Мечей",
      "7 Мечей",
      "9 Мечей",
      "10 Мечей",
      "Дьявол",
      "Башня",
      "5 Жезлов",
      "7 Жезлов",
      "Справедливость",
    ],
    slavic: ["Чернобог", "Перун", "Сила", "Рок"],
    astrology: ["Мангала", "Шани", "Раху"],
  },
  "Знак свыше": {
    runes: ["Ансуз", "Перт", "Альгиз", "Соулу", "Дагаз"],
    "tarot-veronika": ["Звезда", "Луна", "Суд", "Иерофант", "Мир", "Колесо Фортуны", "Отшельник"],
    "tarot-marina": ["Звезда", "Луна", "Суд", "Иерофант", "Мир", "Колесо Фортуны"],
    slavic: ["Алатырь", "Радуга", "Ветер"],
    astrology: ["Гуру", "Кету", "Сурья"],
    lenormand: LENORMAND_SIGN,
  },
  life_death: {
    // Prefer living/connection symbols; hard Death/Tower cards are not boosted.
    runes: ["Альгиз", "Соулу", "Райдо", "Иса", "Перт", "Феху", "Гебо", "Отал", "Манназ"],
    "tarot-veronika": [
      "Звезда",
      "Солнце",
      "Мир",
      "Колесо Фортуны",
      "Луна",
      "Отшельник",
      "Повешенный",
      "Сила",
      "6 Мечей",
      "8 Мечей",
      "2 Кубков",
      "Шут",
    ],
    "tarot-marina": ["Звезда", "Солнце", "Луна", "Отшельник", "6 Мечей", "2 Кубков"],
    slavic: ["Исток", "Даждьбог", "Ветер", "Опора", "Радуга", "Есть", "Леля"],
    astrology: ["Сурья", "Чандра", "Кету", "Гуру", "Шани"],
  },
};

function normalizeName(name: string): string {
  return name.trim().replace(/ё/g, "е").toLowerCase();
}

function matchesPreferred(cardName: string, preferred: string[]): boolean {
  const n = normalizeName(cardName);
  return preferred.some((p) => {
    const pn = normalizeName(p);
    return n === pn || n.includes(pn) || pn.includes(n);
  });
}

/**
 * Draw a spread biased toward the session intention.
 * ~70% of picks prefer theme-aligned symbols; rest keeps variety.
 */
export function drawIntentionSpread(
  system: DeckSystem,
  intention: DrawIntention,
  count = 3,
  rng: SpreadRng = Math.random
): SpreadSymbol[] {
  const deck = [...DECK_REGISTRY[system].symbols];
  const preferredNames = INTENTION_PREFERRED[intention]?.[system] ?? [];
  const preferred = deck.filter((s) => matchesPreferred(s.name, preferredNames));
  const pool = [...deck];
  const drawn: SpreadSymbol[] = [];

  while (drawn.length < count && pool.length > 0) {
    const usePreferred = preferred.length > 0 && rng() < 0.72;

    let pick: SpreadSymbol | undefined;

    if (usePreferred) {
      const available = preferred.filter((s) => pool.some((p) => p.name === s.name));
      if (available.length) {
        pick = available[Math.floor(rng() * available.length)];
      }
    }

    if (!pick) {
      pick = pool[Math.floor(rng() * pool.length)];
    }

    const idx = pool.findIndex((s) => s.name === pick!.name);
    if (idx >= 0) pool.splice(idx, 1);
    drawn.push(pick);
  }

  return drawn;
}

/** Uniform random pick — used only for numerolog preview draw. */
export function drawUniformSpread(
  system: DeckSystem,
  count = 3,
  rng: SpreadRng = Math.random
): SpreadSymbol[] {
  const deck = [...DECK_REGISTRY[system].symbols];
  const pool = [...deck];
  const drawn: SpreadSymbol[] = [];
  while (drawn.length < count && pool.length > 0) {
    const pick = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    if (pick) drawn.push(pick);
  }
  return drawn;
}

export function drawSeededIntentionSpread(
  system: DeckSystem,
  intention: DrawIntention,
  count: number,
  seed: string
): SpreadSymbol[] {
  return drawIntentionSpread(system, intention, count, createSeededRng(seed));
}

export function drawSeededUniformSpread(
  system: DeckSystem,
  count: number,
  seed: string
): SpreadSymbol[] {
  return drawUniformSpread(system, count, createSeededRng(seed));
}

/** Resolve drawn card names back to deck symbols (for fixed spreads after flip). */
export function resolveSpreadSymbols(
  system: DeckSystem,
  names: string[]
): SpreadSymbol[] {
  const resolved: SpreadSymbol[] = [];
  for (const name of names) {
    const sym = findSymbolByName(system, name);
    if (sym) resolved.push(sym);
  }
  return resolved;
}

/** Build spread symbols for session start (numerolog numbers, intention flip, etc.). */
export function buildSessionSpreadCards(
  characterKey: string,
  cardNames: string[],
  options?: {
    previewCards?: { name: string; meaning?: string }[];
    deckSystem?: DeckSystem;
    cardCount?: number;
    positionLabels?: string[];
  }
): { spreadCards: SpreadSymbol[]; system: DeckSystem } {
  const system = options?.deckSystem ?? resolveMasterDeckSystem(characterKey);
  const count = options?.cardCount ?? 3;
  const positions = options?.positionLabels ?? [...getDeckPositions(system)].slice(0, count);
  const names = cardNames.slice(0, count);
  const fromNames = resolveSpreadSymbols(system, names);
  if (fromNames.length >= count) {
    return { spreadCards: fromNames.slice(0, count), system };
  }

  const preview = options?.previewCards?.slice(0, count);
  if (preview && preview.length >= count) {
    const spreadCards: SpreadSymbol[] = preview.map((c, i) => {
      const deckSym = findSymbolByName(system, c.name);
      if (deckSym) {
        return { ...deckSym, meaning: c.meaning ?? deckSym.meaning };
      }
      return {
        id: i,
        name: c.name,
        meaning: c.meaning ?? positions[i] ?? `Позиция ${i + 1}`,
      };
    });
    return { spreadCards, system };
  }

  const spreadCards: SpreadSymbol[] = names.map((name, i) => {
    const sym = findSymbolByName(system, name);
    return (
      sym ?? {
        id: i,
        name,
        meaning: positions[i] ?? name,
      }
    );
  });
  return { spreadCards, system };
}
