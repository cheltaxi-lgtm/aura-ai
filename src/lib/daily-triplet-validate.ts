import {
  DECK_REGISTRY,
  DEFAULT_DECK_SYSTEM,
  findSymbolByName,
  resolveMasterDeckSystem,
  type DeckSystem,
} from "@/lib/decks";
import { findShowcaseMaster } from "@/lib/showcase-masters";
import {
  dailyCardsKey,
  normalizeDailyTripletCards,
  type DailyTripletCard,
} from "@/lib/daily-triplet-cards";

const TAROT_DECKS = new Set<DeckSystem>(["tarot-veronika", "tarot-marina"]);

export type DailyValidationOk = {
  ok: true;
  masterId: string;
  deckSystem: DeckSystem;
  cards: DailyTripletCard[];
  cardsKey: string;
};

export type DailyValidationErr = {
  ok: false;
  code: "INVALID_MASTER" | "INVALID_DECK" | "INVALID_CARDS";
  message: string;
};

function isDeckSystem(value: string): value is DeckSystem {
  return Object.prototype.hasOwnProperty.call(DECK_REGISTRY, value);
}

/**
 * Runtime validation for authenticated daily Tarot save.
 * TypeScript casts are not a security boundary.
 */
export function validateDailyTripletInput(input: {
  cards: unknown;
  masterId?: string | null;
  deckSystem?: string | null;
}): DailyValidationOk | DailyValidationErr {
  const masterProvided =
    typeof input.masterId === "string" && Boolean(input.masterId.trim());
  const masterId = masterProvided ? input.masterId!.trim() : "veronika";

  const master = findShowcaseMaster(masterId);
  if (!master) {
    return { ok: false, code: "INVALID_MASTER", message: "Неизвестный мастер" };
  }

  const masterDeck = resolveMasterDeckSystem(master.id);
  if (!TAROT_DECKS.has(masterDeck)) {
    return {
      ok: false,
      code: "INVALID_MASTER",
      message: "Этот мастер не проводит карты дня",
    };
  }

  let deckSystem: DeckSystem = masterDeck;
  if (typeof input.deckSystem === "string" && input.deckSystem.trim()) {
    const raw = input.deckSystem.trim();
    if (!isDeckSystem(raw)) {
      return { ok: false, code: "INVALID_DECK", message: "Неизвестная колода" };
    }
    if (!TAROT_DECKS.has(raw)) {
      return { ok: false, code: "INVALID_DECK", message: "Колода не подходит для карт дня" };
    }
    if (raw !== masterDeck) {
      return {
        ok: false,
        code: "INVALID_DECK",
        message: "Колода не соответствует мастеру",
      };
    }
    deckSystem = raw;
  } else if (!masterProvided) {
    deckSystem = DEFAULT_DECK_SYSTEM;
  }

  const normalized = normalizeDailyTripletCards(input.cards);
  if (!normalized) {
    return { ok: false, code: "INVALID_CARDS", message: "Нужно ровно три карты" };
  }

  const seenIds = new Set<number>();
  const seenNames = new Set<string>();
  const cards: DailyTripletCard[] = [];

  for (let i = 0; i < 3; i++) {
    const raw = normalized[i]!;
    if (raw.position !== i) {
      return {
        ok: false,
        code: "INVALID_CARDS",
        message: "Некорректный порядок карт",
      };
    }
    const symbol = findSymbolByName(deckSystem, raw.name);
    if (!symbol) {
      return { ok: false, code: "INVALID_CARDS", message: "Карта не найдена в колоде" };
    }
    // Prefer registry identity; reject inventing names for foreign ids.
    if (Number.isFinite(raw.id) && raw.id !== symbol.id) {
      const byId = DECK_REGISTRY[deckSystem].symbols.find((s) => s.id === raw.id);
      if (!byId || byId.name !== symbol.name) {
        return { ok: false, code: "INVALID_CARDS", message: "Карта не найдена в колоде" };
      }
    }
    if (seenIds.has(symbol.id) || seenNames.has(symbol.name)) {
      return { ok: false, code: "INVALID_CARDS", message: "Карты в раскладе должны быть разными" };
    }
    seenIds.add(symbol.id);
    seenNames.add(symbol.name);
    cards.push({
      id: symbol.id,
      name: symbol.name,
      position: i,
      reversed: Boolean(raw.reversed),
    });
  }

  return {
    ok: true,
    masterId: master.id,
    deckSystem,
    cards,
    cardsKey: dailyCardsKey(cards),
  };
}
