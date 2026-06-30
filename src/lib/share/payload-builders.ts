import type { CabinetDailyReadingRow, CabinetSessionRow } from "@/lib/cabinet-data";
import { formatCabinetDate, masterDisplay } from "@/lib/cabinet-utils";
import type { SharePayload } from "@/lib/share/types";
import type { RitualClientData } from "@/components/ritual/RitualCard";
import { RITUAL_TYPES } from "@/lib/ritual-config";
import type { SpreadSymbol } from "@/lib/decks/types";

export function sessionToSharePayload(session: CabinetSessionRow): SharePayload {
  const master = masterDisplay(session.characterKey);
  return {
    kind: "session",
    title: session.topicSummary || `Сеанс с ${master.name}`,
    excerpt: session.prediction,
    masterKey: session.characterKey,
    masterName: master.name,
    cards: session.keyCards.map((name) => ({ name })),
    date: formatCabinetDate(session.createdAt),
  };
}

export function dailyReadingToSharePayload(reading: CabinetDailyReadingRow): SharePayload {
  const master = masterDisplay(reading.characterKey);
  return {
    kind: "daily",
    title: `Энергия дня · ${master.name}`,
    excerpt: reading.readingText,
    masterKey: reading.characterKey,
    masterName: master.name,
    deckSystem: reading.deckSystem ?? undefined,
    cards: reading.cards.map((c) => ({
      name: c.name,
      meaning: c.meaning,
      position: c.position,
    })),
    date: reading.readingDate,
  };
}

export function tripletToSharePayload(input: {
  userName: string;
  cards: SpreadSymbol[];
  deckSystem: string;
  teaser: string;
  masterKey?: string;
  masterName?: string;
}): SharePayload {
  return {
    kind: "triplet",
    title: "Расклад из 3 карт",
    excerpt: input.teaser,
    userName: input.userName,
    masterKey: input.masterKey,
    masterName: input.masterName,
    deckSystem: input.deckSystem,
    cards: input.cards.map((c, i) => ({ name: c.name, meaning: c.meaning })),
  };
}

export function ritualToSharePayload(ritual: RitualClientData): SharePayload {
  const cfg = RITUAL_TYPES[ritual.ritualType];
  const date = new Date(ritual.createdAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return {
    kind: "ritual",
    title: cfg.label,
    ritualType: ritual.ritualType,
    ritualLabel: cfg.label,
    masterKey: ritual.characterKey,
    excerpt: ritual.ritualWords ?? ritual.ritualWordOfPower ?? undefined,
    moonPhase: ritual.moonPhase,
    moonSign: ritual.moonSign,
    cards: ritual.cards?.map((c) => ({ name: c.name, position: c.position })),
    date,
  };
}

export function chatSpreadToSharePayload(input: {
  characterId: string;
  masterName?: string;
  spreadTitle: string;
  cards: { name: string; meaning?: string }[];
  deckSystem?: string;
  spreadId?: string;
  excerpt?: string;
}): SharePayload {
  return {
    kind: "reading",
    title: input.spreadTitle,
    excerpt: input.excerpt,
    masterKey: input.characterId,
    masterName: input.masterName,
    cards: input.cards.map((c) => ({ name: c.name, meaning: c.meaning })),
    deckSystem: input.deckSystem,
    spreadId: input.spreadId,
  };
}
