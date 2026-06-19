import { tarotCardsKey } from "@/lib/tarot";

export interface DestinyInterpretation {
  text: string;
  masterId?: string;
  savedAt?: string;
}

export interface DestinyCardContext {
  tarotCards?: { name: string; meaning?: string }[];
  teaser?: string;
  sceneArt?: {
    destiny_card?: string;
    final_report?: string;
    tarot_atmosphere?: string;
    zodiac_avatar?: string;
  };
  interpretation?: DestinyInterpretation;
  onboarding?: { zodiac?: string; name?: string };
}

export interface DestinyReadingRow {
  id: string;
  characterName: string;
  createdAt: string;
  contextData: DestinyCardContext & { type?: string; reading?: string };
}

/** Latest triplet draw (history rows are newest-first). */
export function getLatestTripletDraw<T extends DestinyReadingRow>(
  readings: T[]
): T | null {
  return (
    readings.find(
      (r) => r.characterName === "triplet" && (r.contextData.tarotCards?.length ?? 0) >= 3
    ) ?? null
  );
}

export function mergeSceneArtForSpread<T extends DestinyReadingRow>(
  readings: T[],
  draw: T
): T {
  const cardsKey = tarotCardsKey(draw.contextData.tarotCards);
  let mergedSceneArt = { ...(draw.contextData.sceneArt ?? {}) };

  for (const row of readings) {
    if (tarotCardsKey(row.contextData.tarotCards) !== cardsKey) continue;
    if (!row.contextData.sceneArt) continue;
    mergedSceneArt = { ...mergedSceneArt, ...row.contextData.sceneArt };
  }

  return {
    ...draw,
    contextData: {
      ...draw.contextData,
      sceneArt: Object.keys(mergedSceneArt).length ? mergedSceneArt : draw.contextData.sceneArt,
    },
  };
}

export function getActiveDestinyDraw<T extends DestinyReadingRow>(
  readings: T[]
): T | null {
  const latest = getLatestTripletDraw(readings);
  if (!latest) {
    const fallback = readings.find((r) => (r.contextData.tarotCards?.length ?? 0) >= 3);
    return fallback ?? null;
  }
  return mergeSceneArtForSpread(readings, latest);
}

export function findMasterReadingForSpread<T extends DestinyReadingRow>(
  readings: T[],
  cards: { name: string }[]
): T | null {
  const key = tarotCardsKey(cards);
  for (const row of readings) {
    if (row.contextData.type !== "reading" || row.characterName === "triplet") continue;
    if (tarotCardsKey(row.contextData.tarotCards) !== key) continue;
    if (typeof row.contextData.reading !== "string") continue;
    return row;
  }
  return null;
}

export function resolveDestinyInterpretation<T extends DestinyReadingRow>(
  draw: T,
  readings: T[]
): { text: string; masterId?: string } | null {
  const stored = draw.contextData.interpretation;
  if (stored?.text) {
    return { text: stored.text, masterId: stored.masterId };
  }

  const cards = draw.contextData.tarotCards ?? [];
  const masterReading = findMasterReadingForSpread(readings, cards);
  if (masterReading && typeof masterReading.contextData.reading === "string") {
    return {
      text: masterReading.contextData.reading,
      masterId: masterReading.characterName,
    };
  }

  if (typeof draw.contextData.teaser === "string" && draw.contextData.teaser.trim()) {
    return { text: draw.contextData.teaser };
  }

  return null;
}
