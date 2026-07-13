import type { CharacterVisualKey } from "@/lib/image-prompts";
import { isAiMasterId } from "@/lib/showcase-masters";
import {
  findShowcaseMaster,
  type ShowcaseMaster,
} from "@/lib/showcase-masters";
import { DEFAULT_DECK_SYSTEM, resolveMasterDeckSystem } from "@/lib/decks";
import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";
import type { DeckSystem } from "@/lib/decks/types";
import type { SpreadSymbol } from "@/lib/decks/types";
import {
  resolveTripletDisplaySpread,
} from "@/lib/spread-context";
import {
  latestTripletCreatedAt,
  type StoredReadingRow,
} from "@/lib/reading-progress";
import {
  tripletCooldownFromLastDraw,
  type TripletCooldownStatus,
} from "@/lib/triplet-limit";
import { LAST_MASTER_KEY, PROFILE_KEY } from "@/lib/home-flow-storage";
import type { StoredProfile } from "@/types/stored-profile";

export function profileHasSpread(p: StoredProfile): boolean {
  return (
    (p.tarotCards?.length ?? 0) >= 3 ||
    Object.values(p.deckSpreads ?? {}).some((s) => (s?.length ?? 0) >= 3)
  );
}

export function readStoredProfileSpread(): StoredProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredProfile;
  } catch {
    return null;
  }
}

export function mergeActiveProfile(
  stateProfile: StoredProfile | null | undefined,
  storedProfile: StoredProfile | null
): StoredProfile | null {
  const stateOk =
    stateProfile &&
    (stateProfile.name || stateProfile.birthDate || profileHasSpread(stateProfile));
  const storedOk =
    storedProfile &&
    (storedProfile.name || storedProfile.birthDate || profileHasSpread(storedProfile));

  if (!stateOk && !storedOk) return null;
  if (!stateOk) return storedProfile;
  if (!storedOk) return stateProfile;

  const merged: StoredProfile = { ...stateProfile, ...storedProfile };
  if (profileHasSpread(storedProfile) && !profileHasSpread(stateProfile)) {
    merged.tarotCards = storedProfile.tarotCards;
    merged.deckSystem = storedProfile.deckSystem;
    merged.deckSpreads = storedProfile.deckSpreads;
    merged.teaser = storedProfile.teaser ?? stateProfile.teaser;
  }
  return merged;
}

function isTripletTarotSystem(system: DeckSystem): boolean {
  return system === "tarot-veronika" || system === "tarot-marina";
}

function resolveClassicTripletMasterId(masters: ShowcaseMaster[]): string {
  return findShowcaseMaster(GUEST_TRIPLET_MASTER_ID, masters)?.id ?? GUEST_TRIPLET_MASTER_ID;
}

function normalizeTripletMasterId(
  masterId: string | null | undefined,
  masters: ShowcaseMaster[]
): string | null {
  if (!masterId) return null;
  const master = findShowcaseMaster(masterId, masters);
  if (!master) return null;
  const system = master.system ?? resolveMasterDeckSystem(master.id);
  if (!isTripletTarotSystem(system)) return null;
  return resolveClassicTripletMasterId(masters);
}

export function resolveTripletChatMasterId(
  masters: ShowcaseMaster[],
  tripletSystem: DeckSystem,
  preferredId?: string | null
): string {
  const classicMasterId = resolveClassicTripletMasterId(masters);
  if (!isTripletTarotSystem(tripletSystem)) {
    return classicMasterId;
  }

  const normalizedPreferred = normalizeTripletMasterId(preferredId, masters);
  if (normalizedPreferred) return normalizedPreferred;

  return classicMasterId;
}

export function resolveDefaultTripletMasterId(
  masters: ShowcaseMaster[],
  options: {
    pending?: string | null;
    recapMasterId?: string | null;
    tarotCards?: SpreadSymbol[];
  }
): string {
  void options.tarotCards;
  const normalizedPending = normalizeTripletMasterId(options.pending, masters);
  if (normalizedPending) return normalizedPending;
  const normalizedRecap = normalizeTripletMasterId(options.recapMasterId, masters);
  if (normalizedRecap) return normalizedRecap;
  return resolveClassicTripletMasterId(masters);
}

export function mapProfileReadings(
  readings: { characterName: string; createdAt?: string; contextData: Record<string, unknown> }[]
): StoredReadingRow[] {
  return readings.map((r) => ({
    characterName: r.characterName,
    createdAt: r.createdAt,
    contextData: r.contextData as StoredReadingRow["contextData"],
  }));
}

export function tripletCooldownFromProfileData(data: {
  tripletCooldown?: TripletCooldownStatus;
  readings?: { characterName: string; createdAt?: string; contextData: Record<string, unknown> }[];
}): TripletCooldownStatus {
  if (data.tripletCooldown) return data.tripletCooldown;
  const rows = mapProfileReadings(data.readings ?? []);
  return tripletCooldownFromLastDraw(latestTripletCreatedAt(rows) ?? null);
}

export function profileFromApiPayload(data: {
  profile: Record<string, unknown>;
  profileUserId?: string;
  readings?: { characterName: string; createdAt?: string; contextData: Record<string, unknown> }[];
}): StoredProfile {
  const mappedReadings = (data.readings ?? []).map((r) => ({
    characterName: r.characterName,
    createdAt: r.createdAt,
    contextData: r.contextData as StoredReadingRow["contextData"],
  }));
  const tripletSpread = resolveTripletDisplaySpread(mappedReadings, null, DEFAULT_DECK_SYSTEM);
  const cards = tripletSpread.cards.length >= 3 ? tripletSpread.cards : [];
  const deckSystem = tripletSpread.cards.length >= 3 ? tripletSpread.system : undefined;
  const latestTriplet = mappedReadings
    .filter((r) => r.characterName === "triplet")
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
  const latestTripletCtx = latestTriplet?.contextData as
    | { teaser?: string; masterId?: string }
    | undefined;
  const teaser =
    typeof latestTripletCtx?.teaser === "string" ? latestTripletCtx.teaser : undefined;
  const tripletMasterFromHistory =
    typeof latestTripletCtx?.masterId === "string" ? latestTripletCtx.masterId : undefined;

  const p = data.profile;
  const spreadCleared = cards.length < 3;

  return {
    name: String(p.name ?? ""),
    gender: (p.gender as StoredProfile["gender"]) ?? "female",
    birthDate: String(p.birthDate ?? ""),
    zodiac: String(p.zodiac ?? ""),
    birthTime: (p.birthTime as string | undefined) ?? undefined,
    birthCity: (p.birthCity as string | undefined) ?? undefined,
    lifeFocus: (p.lifeFocus as StoredProfile["lifeFocus"]) ?? undefined,
    mainQuestion: (p.mainQuestion as string | undefined) ?? undefined,
    astroMeta: (p.astroMeta as StoredProfile["astroMeta"]) ?? undefined,
    userId: data.profileUserId,
    tarotCards: spreadCleared ? [] : cards,
    deckSystem: spreadCleared ? undefined : deckSystem,
    teaser: spreadCleared ? undefined : teaser,
    deckSpreads: spreadCleared || !deckSystem ? undefined : { [deckSystem]: cards },
    tripletMasterId: spreadCleared ? undefined : tripletMasterFromHistory,
  };
}

export function mergeProfileWithServer(
  restored: StoredProfile,
  prev: StoredProfile | null | undefined,
  tripletDraftInProgress: boolean
): StoredProfile {
  if (prev?.userId && restored.userId && prev.userId !== restored.userId) {
    return restored;
  }

  if (tripletDraftInProgress && (prev?.tarotCards?.length ?? 0) >= 3) {
    return {
      ...restored,
      tarotCards: prev!.tarotCards!,
      deckSystem: prev!.deckSystem ?? restored.deckSystem,
      teaser: prev!.teaser ?? restored.teaser,
      deckSpreads: prev!.deckSpreads ?? restored.deckSpreads,
      lastTripletDrawAt: prev!.lastTripletDrawAt ?? restored.lastTripletDrawAt,
    };
  }

  const prevHasSpread =
    (prev?.tarotCards?.length ?? 0) >= 3 ||
    Object.values(prev?.deckSpreads ?? {}).some((s) => (s?.length ?? 0) >= 3);
  const serverHasSpread = (restored.tarotCards?.length ?? 0) >= 3;

  const astroAnchor =
    typeof restored.astroMeta === "object" &&
    restored.astroMeta !== null &&
    "lastTripletDrawAt" in restored.astroMeta &&
    typeof (restored.astroMeta as Record<string, unknown>).lastTripletDrawAt === "string"
      ? ((restored.astroMeta as Record<string, unknown>).lastTripletDrawAt as string)
      : undefined;

  if (serverHasSpread) {
    return {
      ...restored,
      lastTripletDrawAt: prev?.lastTripletDrawAt ?? astroAnchor ?? restored.lastTripletDrawAt,
    };
  }

  return {
    ...restored,
    birthDate: restored.birthDate || prev?.birthDate || "",
    zodiac: restored.zodiac || prev?.zodiac || "",
    birthTime: restored.birthTime ?? prev?.birthTime,
    birthCity: restored.birthCity ?? prev?.birthCity,
    tarotCards: prevHasSpread ? prev!.tarotCards! : [],
    deckSystem: prevHasSpread ? prev!.deckSystem ?? restored.deckSystem : undefined,
    deckSpreads: prevHasSpread ? prev!.deckSpreads ?? restored.deckSpreads : undefined,
    teaser: prevHasSpread ? prev!.teaser ?? restored.teaser : undefined,
    tripletMasterId: prevHasSpread
      ? prev!.tripletMasterId ?? restored.tripletMasterId
      : undefined,
    lastTripletDrawAt: prev?.lastTripletDrawAt ?? astroAnchor,
  };
}

export function clearSpreadSessionState(setLastMasterId: (id: string | null) => void): void {
  localStorage.removeItem(LAST_MASTER_KEY);
  setLastMasterId(null);
}

export function masterVisualKey(characterId: string): CharacterVisualKey | undefined {
  if (!isAiMasterId(characterId)) return "veronika";
  return characterId as CharacterVisualKey;
}

export function buildOnboardingPostBody(
  base: StoredProfile,
  cards: SpreadSymbol[],
  teaser: string,
  sessionId?: string,
  deckSystem?: DeckSystem,
  tripletMasterId?: string
) {
  const birthTime = base.birthTime?.trim();
  const birthCity = base.birthCity?.trim();
  return {
    name: base.name?.trim() || "",
    gender: base.gender === "male" || base.gender === "female" ? base.gender : "female",
    birthDate: base.birthDate || "",
    zodiac: base.zodiac || "",
    ...(birthTime ? { birthTime } : {}),
    ...(birthCity ? { birthCity } : {}),
    lifeFocus: base.lifeFocus ?? "general",
    mainQuestion: base.mainQuestion?.trim() || undefined,
    ...(sessionId ? { sessionId } : {}),
    tarotCards: cards.map((c) => ({
      id: c.id,
      name: c.name,
      meaning: c.meaning,
      ...(c.arcana ? { arcana: c.arcana } : {}),
      ...(c.suit ? { suit: c.suit } : {}),
    })),
    deckSystem: deckSystem ?? base.deckSystem ?? DEFAULT_DECK_SYSTEM,
    teaser,
    masterId: tripletMasterId ?? base.tripletMasterId,
  };
}

export function onboardingErrorMessage(data: {
  error?: string;
  code?: string;
  step?: string;
  detail?: string;
  message?: string;
  missing?: string[];
}): string {
  if (data.error === "TRIPLET_COOLDOWN") {
    return data.message ?? "Новый расклад доступен один раз в сутки";
  }
  if (data.error === "Заполните профиль" || data.code === "MISSING_PROFILE") {
    const fields = data.missing?.length ? ` (${data.missing.join(", ")})` : "";
    return `Заполните профиль${fields}. Вернитесь к анкете.`;
  }
  if (data.error === "Database unavailable") {
    return "Сервер временно недоступен. Попробуйте через минуту.";
  }
  if (data.detail) {
    return `${data.error ?? "Ошибка"}: ${data.detail}`;
  }
  return data.message ?? data.error ?? "Не удалось сохранить расклад. Попробуйте ещё раз.";
}
