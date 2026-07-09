import type { CabinetDailyReadingRow, CabinetSessionRow } from "@/lib/cabinet-data";
import { formatCabinetDate, masterDisplay } from "@/lib/cabinet-utils";
import type { SharePayload, ShareSourceType } from "@/lib/share/types";
import type { RitualClientData } from "@/components/ritual/RitualCard";
import { RITUAL_TYPES } from "@/lib/ritual-config";
import type { SpreadSymbol } from "@/lib/decks/types";

function withSource(
  payload: SharePayload,
  sourceType: ShareSourceType,
  sourceId?: string
): SharePayload {
  return {
    ...payload,
    sourceType,
    sourceId: sourceId ?? payload.sessionId ?? payload.historyId,
  };
}

export function sessionToSharePayload(session: CabinetSessionRow): SharePayload {
  const master = masterDisplay(session.characterKey);
  return withSource(
    {
      kind: "session",
      title: session.topicSummary || `Сеанс с ${master.name}`,
      excerpt: session.prediction,
      masterKey: session.characterKey,
      masterName: master.name,
      cards: session.keyCards.map((name) => ({ name })),
      date: formatCabinetDate(session.createdAt),
      sessionId: session.sessionId ?? undefined,
    },
    "session",
    session.sessionId ?? undefined
  );
}

export function dailyReadingToSharePayload(reading: CabinetDailyReadingRow): SharePayload {
  const master = masterDisplay(reading.characterKey);
  return withSource(
    {
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
    },
    "daily",
    reading.id
  );
}

export function tripletToSharePayload(input: {
  userName: string;
  cards: SpreadSymbol[];
  deckSystem: string;
  teaser: string;
  masterKey?: string;
  masterName?: string;
}): SharePayload {
  return withSource(
    {
      kind: "triplet",
      title: "Расклад из 3 карт",
      excerpt: input.teaser,
      userName: input.userName,
      masterKey: input.masterKey,
      masterName: input.masterName,
      deckSystem: input.deckSystem,
      cards: input.cards.map((c) => ({ name: c.name, meaning: c.meaning })),
    },
    "triplet"
  );
}

export function ritualToSharePayload(ritual: RitualClientData): SharePayload {
  const cfg = RITUAL_TYPES[ritual.ritualType];
  const master = masterDisplay(ritual.characterKey);
  const date = new Date(ritual.createdAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return withSource(
    {
      kind: "ritual",
      title: cfg.label,
      ritualType: ritual.ritualType,
      ritualLabel: cfg.label,
      masterKey: ritual.characterKey,
      masterName: master.name,
      excerpt: ritual.ritualWords ?? ritual.ritualWordOfPower ?? undefined,
      moonPhase: ritual.moonPhase,
      moonSign: ritual.moonSign,
      cards: ritual.cards?.map((c) => ({ name: c.name, position: c.position })),
      date,
    },
    "ritual",
    ritual.id
  );
}

export function jointReadingToSharePayload(input: {
  token: string;
  initiatorName?: string | null;
  partnerName?: string | null;
  combinedReading: string;
  date?: string;
}): SharePayload {
  const labelA = input.initiatorName?.trim() || "Он";
  const labelB = input.partnerName?.trim() || "Она";
  return withSource(
    {
      kind: "joint",
      title: `Совместный расклад: ${labelA} и ${labelB}`,
      excerpt: input.combinedReading,
      date: input.date,
    },
    "joint",
    input.token
  );
}

export function chatSpreadToSharePayload(input: {
  characterId: string;
  masterName?: string;
  spreadTitle: string;
  cards: { name: string; meaning?: string }[];
  deckSystem?: string;
  spreadId?: string;
  excerpt?: string;
  sessionId?: string;
}): SharePayload {
  return withSource(
    {
      kind: "reading",
      title: input.spreadTitle,
      excerpt: input.excerpt,
      masterKey: input.characterId,
      masterName: input.masterName,
      cards: input.cards.map((c) => ({ name: c.name, meaning: c.meaning })),
      deckSystem: input.deckSystem,
      spreadId: input.spreadId,
      sessionId: input.sessionId,
    },
    "session",
    input.sessionId
  );
}

export function historyReadingToSharePayload(input: {
  historyId: string;
  title: string;
  text: string;
  masterKey?: string;
  masterName?: string;
  date?: string;
  cards?: { name: string; meaning?: string }[];
  spreadType?: string;
  sessionId?: string;
}): SharePayload {
  return withSource(
    {
      kind: "reading",
      title: input.title,
      excerpt: input.text,
      masterKey: input.masterKey,
      masterName: input.masterName,
      cards: input.cards,
      spreadType: input.spreadType,
      date: input.date,
      historyId: input.historyId,
      sessionId: input.sessionId,
    },
    "history",
    input.historyId
  );
}
