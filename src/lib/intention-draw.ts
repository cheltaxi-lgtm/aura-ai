import {
  DECK_REGISTRY,
  findSymbolByName,
  getDeckPositions,
  resolveMasterDeckSystem,
  type DeckSystem,
} from "@/lib/decks";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { SessionIntention } from "@/lib/intention";

export type DrawIntention = SessionIntention | "life_death";

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
      "Туз кубков",
      "Двойка кубков",
      "Тройка кубков",
      "Девятка кубков",
      "Десять кубков",
      "Королева кубков",
      "Рыцарь кубков",
    ],
    "tarot-marina": [
      "Влюблённые",
      "Императрица",
      "Туз кубков",
      "Двойка кубков",
      "Тройка кубков",
      "Девятка кубков",
      "Десять кубков",
      "Королева кубков",
    ],
    slavic: ["Леля", "Берегиня", "Даждьбог", "Уд"],
    astrology: ["Шукра", "Чандра", "Гуру"],
  },
  Деньги: {
    runes: ["Феху", "Йера", "Райдо", "Соулу", "Отал"],
    "tarot-veronika": [
      "Туз пентаклей",
      "Девятка пентаклей",
      "Десять пентаклей",
      "Король пентаклей",
      "Королева пентаклей",
      "Императрица",
      "Колесо Фортуны",
      "Шестёрка пентаклей",
      "Восьмёрка пентаклей",
    ],
    "tarot-marina": [
      "Туз пентаклей",
      "Девятка пентаклей",
      "Десять пентаклей",
      "Король пентаклей",
      "Императрица",
      "Колесо Фортуны",
    ],
    slavic: ["Даждьбог", "Уд", "Опора"],
    astrology: ["Гуру", "Шукра", "Шани"],
  },
  Здоровье: {
    runes: ["Уруз", "Соулу", "Беркана", "Ингуз", "Альгиз"],
    "tarot-veronika": [
      "Сила",
      "Солнце",
      "Звезда",
      "Императрица",
      "Четвёрка мечей",
      "Умеренность",
      "Мир",
    ],
    "tarot-marina": ["Сила", "Солнце", "Звезда", "Императрица", "Четвёрка мечей", "Умеренность"],
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
      "Пятёрка мечей",
      "Семёрка мечей",
      "Девятка мечей",
      "Десять мечей",
      "Тройка мечей",
      "Дьявол",
      "Башня",
      "Пятёрка жезлов",
      "Семёрка жезлов",
      "Справедливость",
      "Сила",
      "Император",
      "Повешенный",
    ],
    "tarot-marina": [
      "Пятёрка мечей",
      "Семёрка мечей",
      "Девятка мечей",
      "Десять мечей",
      "Дьявол",
      "Башня",
      "Пятёрка жезлов",
      "Семёрка жезлов",
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
  },
  life_death: {
    runes: ["Альгиз", "Совило", "Райдо", "Иса", "Хагалаз", "Перт", "Феху", "Гебo", "Одал"],
    "tarot-veronika": [
      "Звезда",
      "Солнце",
      "Мир",
      "Колесо Фортуны",
      "Луна",
      "Отшельник",
      "Повешенный",
      "Сила",
      "Башня",
      "Десятка Мечей",
      "Восьмёрка Мечей",
      "Шестёрка Мечей",
    ],
    "tarot-marina": ["Звезда", "Солнце", "Луна", "Отшельник", "Башня", "Десятка Мечей"],
    slavic: ["Живая вода", "Огонь горит", "Птица летит", "Дуб", "Заря", "Буря", "Болото", "Волк"],
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
  count = 3
): SpreadSymbol[] {
  const deck = [...DECK_REGISTRY[system].symbols];
  const preferredNames = INTENTION_PREFERRED[intention]?.[system] ?? [];
  const preferred = deck.filter((s) => matchesPreferred(s.name, preferredNames));
  const pool = [...deck];
  const drawn: SpreadSymbol[] = [];

  while (drawn.length < count && pool.length > 0) {
    const usePreferred = preferred.length > 0 && Math.random() < 0.72;

    let pick: SpreadSymbol | undefined;

    if (usePreferred) {
      const available = preferred.filter((s) => pool.some((p) => p.name === s.name));
      if (available.length) {
        pick = available[Math.floor(Math.random() * available.length)];
      }
    }

    if (!pick) {
      pick = pool[Math.floor(Math.random() * pool.length)];
    }

    const idx = pool.findIndex((s) => s.name === pick!.name);
    if (idx >= 0) pool.splice(idx, 1);
    drawn.push(pick);
  }

  return drawn;
}

/** Uniform random pick — used only for numerolog preview draw. */
export function drawUniformSpread(system: DeckSystem, count = 3): SpreadSymbol[] {
  const deck = [...DECK_REGISTRY[system].symbols];
  const pool = [...deck];
  const drawn: SpreadSymbol[] = [];
  while (drawn.length < count && pool.length > 0) {
    const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (pick) drawn.push(pick);
  }
  return drawn;
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
