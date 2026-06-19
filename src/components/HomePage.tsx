"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles, Layers, ArrowLeft, Camera } from "lucide-react";
import Link from "next/link";

import OnboardingForm, { type OnboardingData } from "@/components/OnboardingForm";
import TarotTriplet from "@/components/TarotTriplet";
import MasterSelect from "@/components/MasterSelect";
import ChatWindow from "@/components/ChatWindow";
import Paywall from "@/components/Paywall";
import AuthHeader from "@/components/AuthHeader";
import RuneBalance, { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import RuneShopModal from "@/components/RuneShopModal";
import { type FlowStep } from "@/components/FlowStepper";
import AuraSellingLanding from "@/components/AuraSellingLanding";
import ReadingRecap from "@/components/ReadingRecap";
import DeckGallery from "@/components/DeckGallery";
import MasterDecksModal from "@/components/MasterDecksModal";
import PhotoReadingFlow from "@/components/PhotoReadingFlow";
import { buildPhotoReadingChatMessages } from "@/lib/photo-chat";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { useAuraSession } from "@/lib/useSession";
import { useAuth } from "@/lib/useAuth";
import {
  findShowcaseMaster,
  getAiMasters,
  isAiMasterId,
  recommendShowcaseMaster,
  type ShowcaseMaster,
} from "@/lib/showcase-masters";
import { getCharacterById } from "@/lib/characters";
import RegisterGate from "@/components/RegisterGate";
import WelcomeBackBanner from "@/components/WelcomeBackBanner";
import AppBootstrapScreen from "@/components/AppBootstrapScreen";
import { generateId } from "@/lib/id";
import { loadChatCache, saveChatCache, clearChatCache, mastersWithCachedReading, chatHasSpreadReading } from "@/lib/chat-cache";
import { mergeContinueMasterIds, latestTripletCreatedAt, primaryContinueMasterId, type StoredReadingRow } from "@/lib/reading-progress";
import {
  formatTripletCooldownRu,
  tripletCooldownFromLastDraw,
  type TripletCooldownStatus,
} from "@/lib/triplet-limit";
import {
  mergeTripletCooldownWithAnchors,
  writeLocalTripletDrawAt,
} from "@/lib/triplet-cooldown-client";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckSystem } from "@/lib/decks/types";
import { DEFAULT_DECK_SYSTEM, getDeckPositions, resolveMasterDeckSystem, spreadKey } from "@/lib/decks";
import { resolveSpreadSymbol } from "@/lib/symbol-visuals";
import {
  getSpreadForSystem,
  resolveMasterSpread,
  resolveRecapSpread,
  profilePayloadForMaster,
} from "@/lib/spread-context";
import { requestSceneImage, tarotCardNames } from "@/lib/scene-images-client";
import type { CharacterVisualKey } from "@/lib/image-prompts";
import type { Message } from "@/types";
import { loadGuestTriplet, mergeGuestTripletIntoProfile, clearGuestTriplet } from "@/lib/guest-triplet";
import { buildSpreadTeaser } from "@/lib/spread-teaser";
import { useTripletCountdown } from "@/hooks/useTripletCountdown";

const PROFILE_KEY = "aura_profile";
const FLOW_STEP_KEY = "aura_flow_step";
const LAST_VISIT_KEY = "aura_last_visit";
const LAST_MASTER_KEY = "aura_last_master";
const PENDING_MASTER_KEY = "aura_pending_master";
const PENDING_READING_KEY = "aura_pending_reading";

export interface StoredProfile extends OnboardingData {
  userId?: string;
  tarotCards: SpreadSymbol[];
  deckSystem?: DeckSystem;
  deckSpreads?: Partial<Record<DeckSystem, SpreadSymbol[]>>;
  teaser?: string;
  /** Client-side anchor for 24h triplet limit (survives spread deletion). */
  lastTripletDrawAt?: string;
}

export interface HomePageProps {
  referrerSlug?: string;
}

function cardLabel(card: SpreadSymbol | { name?: string } | string): string {
  if (typeof card === "string") return card;
  return card?.name ?? "карта";
}

function buildTeaser(profile: StoredProfile | null): string {
  if (profile?.teaser) return profile.teaser;
  const names = (profile?.tarotCards ?? []).map(cardLabel);
  if (profile?.name && names.length) {
    return `${profile.name}, ваш расклад: ${names.join(" · ")}. Мастер готовит полную расшифровку…`;
  }
  return "Мастер на связи. Задайте вопрос — ответ придёт в чат.";
}

function profileApiPayload(
  profile: StoredProfile,
  masterId?: string,
  mastersList?: ShowcaseMaster[]
) {
  if (masterId) {
    return profilePayloadForMaster(profile, masterId, mastersList);
  }
  return {
    userName: profile.name,
    gender: profile.gender === "male" ? "Мужской" : "Женский",
    zodiac: profile.zodiac,
    birthDate: profile.birthDate,
    birthTime: profile.birthTime,
    birthCity: profile.birthCity,
    lifeFocus: profile.lifeFocus,
    mainQuestion: profile.mainQuestion,
    astroMeta: profile.astroMeta,
    tarotCards: profile.tarotCards,
  };
}



function mapProfileReadings(
  readings: { characterName: string; createdAt?: string; contextData: Record<string, unknown> }[]
): StoredReadingRow[] {
  return readings.map((r) => ({
    characterName: r.characterName,
    createdAt: r.createdAt,
    contextData: r.contextData as StoredReadingRow["contextData"],
  }));
}

function resolveDestinyCardUrl(
  readings: StoredReadingRow[],
  cardsKey: string,
  characterId: string
): string | null {
  if (!cardsKey || !characterId) return null;

  for (const row of readings) {
    if (row.characterName !== characterId) continue;
    if (spreadKey(row.contextData?.tarotCards) !== cardsKey) continue;
    const url = row.contextData?.sceneArt?.destiny_card;
    if (url) return url;
  }

  return null;
}

function tripletCooldownFromProfileData(data: {
  tripletCooldown?: TripletCooldownStatus;
  readings?: { characterName: string; createdAt?: string; contextData: Record<string, unknown> }[];
}): TripletCooldownStatus {
  if (data.tripletCooldown) return data.tripletCooldown;
  const rows = mapProfileReadings(data.readings ?? []);
  return tripletCooldownFromLastDraw(latestTripletCreatedAt(rows) ?? null);
}

function profileFromApiPayload(data: {
  profile: Record<string, unknown>;
  profileUserId?: string;
  readings?: { characterName: string; contextData: Record<string, unknown> }[];
  keepSpread?: boolean;
}): StoredProfile {
  const latestTriplet = data.readings?.find((r) => r.characterName === "triplet");
  const cards = (latestTriplet?.contextData?.tarotCards as SpreadSymbol[] | undefined) ?? [];
  const deckSystem =
    (latestTriplet?.contextData?.deckSystem as DeckSystem | undefined) ?? DEFAULT_DECK_SYSTEM;
  const teaser =
    typeof latestTriplet?.contextData?.teaser === "string"
      ? latestTriplet.contextData.teaser
      : undefined;

  const p = data.profile;
  const spreadCleared = data.keepSpread === false || cards.length < 3;

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
    deckSpreads: spreadCleared ? undefined : { [deckSystem]: cards },
  };
}

function mergeProfileWithServer(
  restored: StoredProfile,
  prev: StoredProfile | null | undefined,
  tripletDraftInProgress: boolean
): StoredProfile {
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
  const astroAnchor =
    typeof restored.astroMeta === "object" &&
    restored.astroMeta !== null &&
    "lastTripletDrawAt" in restored.astroMeta &&
    typeof (restored.astroMeta as Record<string, unknown>).lastTripletDrawAt === "string"
      ? ((restored.astroMeta as Record<string, unknown>).lastTripletDrawAt as string)
      : undefined;
  return {
    ...restored,
    lastTripletDrawAt: prev?.lastTripletDrawAt ?? astroAnchor ?? restored.lastTripletDrawAt,
  };
}

function clearSpreadSessionState(
  setLastMasterId: (id: string | null) => void
): void {
  localStorage.removeItem(LAST_MASTER_KEY);
  setLastMasterId(null);
  clearChatCache();
}

function masterVisualKey(characterId: string): CharacterVisualKey | undefined {
  if (!isAiMasterId(characterId)) return "veronika";
  return characterId as CharacterVisualKey;
}

function persistPendingReading(masterId: string, required: number) {
  localStorage.setItem(PENDING_READING_KEY, JSON.stringify({ masterId, required }));
}

function readPendingReading(): { masterId: string; required: number } | null {
  try {
    const raw = localStorage.getItem(PENDING_READING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { masterId?: string; required?: number };
    if (!parsed.masterId) return null;
    return { masterId: parsed.masterId, required: parsed.required ?? 0 };
  } catch {
    return null;
  }
}

function clearPendingReading() {
  localStorage.removeItem(PENDING_READING_KEY);
}

function buildOnboardingPostBody(
  base: StoredProfile,
  cards: SpreadSymbol[],
  teaser: string,
  sessionId?: string,
  deckSystem?: DeckSystem
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
  };
}

function onboardingErrorMessage(data: {
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

function persistStep(step: FlowStep) {
  localStorage.setItem(FLOW_STEP_KEY, step);
}

function readStoredProfile(): StoredProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredProfile;
  } catch {
    return null;
  }
}

function resolveDefaultTripletMasterId(
  masters: ShowcaseMaster[],
  options: {
    pending?: string | null;
    recapMasterId?: string | null;
    tarotCards?: SpreadSymbol[];
  }
): string {
  if (options.pending && findShowcaseMaster(options.pending, masters)) {
    return options.pending;
  }
  if (options.recapMasterId && findShowcaseMaster(options.recapMasterId, masters)) {
    return options.recapMasterId;
  }
  if (options.tarotCards?.length) {
    const recommended = recommendShowcaseMaster(options.tarotCards, masters);
    if (recommended && findShowcaseMaster(recommended, masters)) {
      return recommended;
    }
  }
  return masters[0]?.id ?? "";
}

export default function HomePage({ referrerSlug }: HomePageProps) {
  const { config: runeConfig, cost: runeCost, formatRunes } = useRuneConfig();
  const { session, loading: sessionLoading, refresh, reconnectSession } = useAuraSession(referrerSlug);
  const { isLoggedIn, loading: authLoading, user: authUser } = useAuth();
  const [step, setStepState] = useState<FlowStep>("intro");
  const [profile, setProfile] = useState<StoredProfile | null>(readStoredProfile);
  const [tripletSystem, setTripletSystem] = useState<DeckSystem>(DEFAULT_DECK_SYSTEM);
  const [tripletMasterId, setTripletMasterId] = useState("");
  const [masters, setMasters] = useState<ShowcaseMaster[]>(() => getAiMasters());
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [lastMasterId, setLastMasterId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [deckGalleryOpen, setDeckGalleryOpen] = useState(false);
  const [browseDeckMaster, setBrowseDeckMaster] = useState<ShowcaseMaster | null>(null);
  const [showDecksModal, setShowDecksModal] = useState(false);
  const [showRuneShop, setShowRuneShop] = useState(false);
  const [insufficientRunes, setInsufficientRunes] = useState<{
    balance: number;
    required: number;
  } | null>(null);
  const [runeBalance, setRuneBalance] = useState(0);
  const [chatHeaderImage, setChatHeaderImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savedReadings, setSavedReadings] = useState<StoredReadingRow[]>([]);
  const [tripletCooldown, setTripletCooldown] = useState<TripletCooldownStatus | null>(null);
  const [tripletCooldownReady, setTripletCooldownReady] = useState(false);

  const effectiveTripletCooldown = useMemo(
    () => mergeTripletCooldownWithAnchors(tripletCooldown, profile?.lastTripletDrawAt),
    [tripletCooldown, profile?.lastTripletDrawAt]
  );

  const tripletCountdown = useTripletCountdown(effectiveTripletCooldown.nextAvailableAt);
  const [tripletNotice, setTripletNotice] = useState<string | null>(null);
  const [serverContinueIds, setServerContinueIds] = useState<string[]>([]);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [photoReadingOpen, setPhotoReadingOpen] = useState(false);
  const [newTripletDraft, setNewTripletDraft] = useState(false);
  const [sessionOnlyChat, setSessionOnlyChat] = useState(false);
  const readingInFlightRef = useRef(false);
  const sendingRef = useRef(false);
  const skipNextReadingRef = useRef(false);
  const autoResumeDoneRef = useRef(false);
  const newTripletInProgressRef = useRef(false);
  const pendingReadingMasterRef = useRef<string | null>(null);
  const pendingReadingResumeRef = useRef<string | null>(null);
  const destinyBackfillRef = useRef<string | null>(null);

  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${sectionId}`);
    }
  }, []);

  const setStep = useCallback((next: FlowStep) => {
    setStepState(next);
    persistStep(next);
    if (typeof window !== "undefined" && next !== "intro") {
      const url = new URL(window.location.href);
      url.searchParams.set("step", next);
      window.history.pushState({ step: next }, "", `${url.pathname}?${url.searchParams.toString()}`);
    }
  }, []);

  const handleReconnectSession = useCallback(async () => {
    setReconnecting(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const refToken = params.get("ref") ?? referrerSlug ?? null;
      await reconnectSession(refToken);
    } finally {
      setReconnecting(false);
    }
  }, [reconnectSession, referrerSlug]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const stepParam = params.get("step") as FlowStep | null;
      const saved = localStorage.getItem(FLOW_STEP_KEY) as FlowStep | null;
      const target = stepParam && stepParam !== "intro" ? stepParam : saved;
      if (target && target !== "intro") {
        setStepState(target);
        persistStep(target);
      } else {
        setStepState("intro");
        persistStep("intro");
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isLoggedIn) return;
    const last = localStorage.getItem(LAST_VISIT_KEY);
    const now = Date.now();
    if (last) {
      const days = (now - Number.parseInt(last, 10)) / (1000 * 60 * 60 * 24);
      if (days >= 1 && profile?.tarotCards?.length) {
        setShowWelcomeBack(true);
      }
    }
    localStorage.setItem(LAST_VISIT_KEY, String(now));
  }, [isLoggedIn, profile?.tarotCards?.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") !== "1") return;
    const paySessionId = params.get("session");
    if (!paySessionId) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) return;
      const updated = await refresh(paySessionId);
      attempts += 1;
      if (updated?.hasAccess) {
        window.history.replaceState(null, "", window.location.pathname);
        const master = localStorage.getItem(LAST_MASTER_KEY);
        if (master) {
          setSelectedCharacter(master);
          setStep("chat");
        } else {
          setStep("masters");
        }
        return;
      }
      if (attempts < 15) {
        window.setTimeout(poll, 2000);
      } else {
        window.history.replaceState(null, "", window.location.pathname);
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [refresh, setStep]);

  useEffect(() => {
    fetch("/api/masters")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.masters?.length) {
          setMasters(data.masters as ShowcaseMaster[]);
        }
      })
      .catch(() => undefined);
  }, []);

  const openPhotoReading = useCallback(() => {
    setPhotoReadingOpen(true);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const photoNavLabel = runeConfig.enabled
    ? `Фото · ${formatRunes(runeCost("VISION_ANALYSIS"))}`
    : "Фото расклад";

  const closePhotoReading = useCallback(() => {
    setPhotoReadingOpen(false);
  }, []);

  const handleBrowseDeck = useCallback((master: ShowcaseMaster) => {
    setBrowseDeckMaster(master);
    setDeckGalleryOpen(true);
    setShowDecksModal(false);
    requestAnimationFrame(() => {
      document.getElementById("колода")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const openDecksModal = useCallback(() => {
    setShowDecksModal(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (params.get("photo") === "1" || hash === "фото-расклад") {
      setPhotoReadingOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.location.hash) return;

    const scrollToHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id === "фото-расклад") return;
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const timer = window.setTimeout(scrollToHash, 150);
    return () => window.clearTimeout(timer);
  }, [step, selectedCharacter, isLoggedIn]);

  useEffect(() => {
    const savedMaster = localStorage.getItem(LAST_MASTER_KEY);
    if (savedMaster) setLastMasterId(savedMaster);

    const stored = localStorage.getItem(PROFILE_KEY);
    if (!stored) return;

    try {
      setProfile(JSON.parse(stored) as StoredProfile);
    } catch {
      localStorage.removeItem(PROFILE_KEY);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!isLoggedIn) {
      setStepState("intro");
      return;
    }

    const stored = localStorage.getItem(PROFILE_KEY);
    const savedStep = localStorage.getItem(FLOW_STEP_KEY) as FlowStep | null;
    const savedMaster = localStorage.getItem(LAST_MASTER_KEY);

    if (!stored) {
      const guest = loadGuestTriplet();
      if (guest && isLoggedIn) {
        const draft: StoredProfile = {
          name: "",
          gender: "female",
          birthDate: "",
          zodiac: "",
          tarotCards: guest.tarotCards,
          deckSystem: guest.deckSystem ?? DEFAULT_DECK_SYSTEM,
          teaser: guest.teaser,
        };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(draft));
        setProfile(draft);
        setStepState(guest.tarotCards.length >= 3 ? "onboarding" : "triplet");
      }
      return;
    }

    try {
      let parsed = JSON.parse(stored) as StoredProfile;
      if (isLoggedIn) {
        parsed = mergeGuestTripletIntoProfile(parsed) as StoredProfile;
        localStorage.setItem(PROFILE_KEY, JSON.stringify(parsed));
        setProfile(parsed);
      }

      if (parsed.tarotCards?.length >= 3) {
        if (savedStep === "chat" && savedMaster) {
          setStepState("chat");
          setSelectedCharacter(savedMaster);
        } else if (savedStep === "chat") {
          setStepState("masters");
          persistStep("masters");
        } else {
          setStepState(savedStep ?? "masters");
        }
      } else if (parsed.name || parsed.birthDate) {
        setStepState(savedStep === "intro" ? "triplet" : savedStep ?? "triplet");
      } else if (savedStep && savedStep !== "intro") {
        setStepState(savedStep);
      }
    } catch {
      localStorage.removeItem(PROFILE_KEY);
    }
  }, [authLoading, isLoggedIn]);

  useEffect(() => {
    if (authLoading || !isLoggedIn) return;
    if (step !== "chat" || selectedCharacter) return;

    const masterId = localStorage.getItem(LAST_MASTER_KEY) || lastMasterId;
    if (masterId) {
      setSelectedCharacter(masterId);
      setLastMasterId(masterId);
      return;
    }

    setStep("masters");
  }, [authLoading, isLoggedIn, step, selectedCharacter, lastMasterId, setStep]);

  useEffect(() => {
    if (!isLoggedIn) return;

    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.profile) return;

        if (Array.isArray(data.readings)) {
          setSavedReadings(
            data.readings.map(
              (r: { characterName: string; createdAt?: string; contextData: Record<string, unknown> }) => ({
                characterName: r.characterName,
                createdAt: r.createdAt,
                contextData: r.contextData as StoredReadingRow["contextData"],
              })
            )
          );
        }
        if (Array.isArray(data.continueMasterIds)) {
          setServerContinueIds(data.continueMasterIds);
        }

        setTripletCooldown(tripletCooldownFromProfileData(data));

        const restored = profileFromApiPayload({
          profile: data.profile,
          profileUserId: data.profileUserId,
          readings: data.readings,
        });

        setProfile((prev) => {
          const localCards = prev?.tarotCards?.length ?? 0;
          const next = mergeProfileWithServer(restored, prev, newTripletInProgressRef.current);
          if (next.tarotCards.length < 3 && localCards >= 3) {
            clearSpreadSessionState(setLastMasterId);
          }
          localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
          return next;
        });

        if (restored.tarotCards.length >= 3) {
          setStepState((prev) => (prev === "intro" ? "masters" : prev));
        } else if (data.profile.birthDate) {
          setStepState((prev) => (prev === "intro" || prev === "onboarding" ? "triplet" : prev));
        }
      })
      .catch(() => undefined)
      .finally(() => setTripletCooldownReady(true));
  }, [isLoggedIn]);

  const refreshSavedReadings = useCallback(() => {
    if (!isLoggedIn) return;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!Array.isArray(data?.readings)) return;
        setSavedReadings(mapProfileReadings(data.readings));
        if (Array.isArray(data.continueMasterIds)) {
          setServerContinueIds(data.continueMasterIds);
        }

        setTripletCooldown(tripletCooldownFromProfileData(data));

        if (data.profile && !newTripletInProgressRef.current) {
          const restored = profileFromApiPayload({
            profile: data.profile,
            profileUserId: data.profileUserId,
            readings: data.readings,
          });
          setProfile((prev) => {
            const localCards = prev?.tarotCards?.length ?? 0;
            const next = mergeProfileWithServer(restored, prev, false);
            if (next.tarotCards.length < 3 && localCards >= 3) {
              clearSpreadSessionState(setLastMasterId);
            }
            localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
            return next;
          });
        }

        fetch("/api/runes/balance")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (typeof d?.balance === "number") setRuneBalance(d.balance);
          })
          .catch(() => undefined);
      })
      .catch(() => undefined);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || step !== "masters") return;
    refreshSavedReadings();
  }, [isLoggedIn, step, refreshSavedReadings]);

  const displayTarotCards = useMemo((): SpreadSymbol[] => {
    const tripletRow = savedReadings.find(
      (row) =>
        row.characterName === "triplet" &&
        (row.contextData?.tarotCards?.length ?? 0) >= 3
    );
    const fromServer = tripletRow?.contextData?.tarotCards ?? [];
    const tripletCtx = tripletRow?.contextData as Record<string, unknown> | undefined;
    const system =
      (tripletCtx?.deckSystem as DeckSystem | undefined) ??
      profile?.deckSystem ??
      DEFAULT_DECK_SYSTEM;
    if (fromServer.length >= 3) {
      return fromServer.slice(0, 3).map((card) => resolveSpreadSymbol(system, card));
    }

    const recap = resolveRecapSpread(profile, tripletSystem);
    return recap.cards.length >= 3 ? recap.cards : [];
  }, [profile, tripletSystem, savedReadings]);

  const tripletCooldownHint = useMemo(() => {
    if (tripletCountdown.isOnCooldown && tripletCountdown.hintRu) return tripletCountdown.hintRu;
    if (!effectiveTripletCooldown.nextAvailableAt) return undefined;
    return `Новый расклад из 3 карт ${formatTripletCooldownRu(effectiveTripletCooldown.nextAvailableAt)}`;
  }, [
    tripletCountdown.isOnCooldown,
    tripletCountdown.hintRu,
    effectiveTripletCooldown.nextAvailableAt,
    tripletCountdown.tick,
  ]);

  const persistProfile = (data: StoredProfile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
    setProfile(data);
  };

  const syncProfileFromServer = useCallback(
    async (opts?: { keepSpread?: boolean }) => {
      const res = await fetch("/api/profile");
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.profile) return null;

      if (Array.isArray(data.readings)) {
        setSavedReadings(mapProfileReadings(data.readings));
      }
      if (Array.isArray(data.continueMasterIds)) {
        setServerContinueIds(data.continueMasterIds);
      }

      const cooldown = tripletCooldownFromProfileData(data);
      setTripletCooldown(cooldown);
      setTripletCooldownReady(true);

      const restored = profileFromApiPayload({
        profile: data.profile,
        profileUserId: data.profileUserId,
        readings: data.readings,
      });

      setProfile((prev) => {
        const localCards = prev?.tarotCards?.length ?? 0;
        const next = mergeProfileWithServer(restored, prev, newTripletInProgressRef.current);
        if (next.tarotCards.length < 3 && localCards >= 3) {
          clearSpreadSessionState(setLastMasterId);
        }
        localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
        return next;
      });
      return { data, cooldown, profile: restored };
    },
    []
  );

  useEffect(() => {
    if (!isLoggedIn) return;
    const resync = () => {
      if (document.visibilityState !== "visible") return;
      void syncProfileFromServer();
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  }, [isLoggedIn, syncProfileFromServer]);

  const continueMasterIds = useMemo(() => {
    if (displayTarotCards.length < 3) return [];
    const cardsKey = spreadKey(displayTarotCards);
    const aiMasterIds = masters.map((m) => m.id);
    const merged = mergeContinueMasterIds(savedReadings, displayTarotCards, {
      cachedMasterIds: mastersWithCachedReading(cardsKey, aiMasterIds),
    });
    return [...new Set(merged)];
  }, [savedReadings, displayTarotCards, masters]);

  const hasActiveSpread = displayTarotCards.length >= 3;
  const spreadReadingDone = hasActiveSpread && continueMasterIds.length > 0;

  const recapContinueMasterId = useMemo(
    () =>
      hasActiveSpread
        ? primaryContinueMasterId(
            savedReadings,
            displayTarotCards,
            continueMasterIds,
            lastMasterId
          )
        : null,
    [hasActiveSpread, savedReadings, displayTarotCards, continueMasterIds, lastMasterId]
  );

  const applyTripletMaster = useCallback(
    (masterId: string) => {
      if (!masterId || !findShowcaseMaster(masterId, masters)) return;
      setTripletMasterId(masterId);
      const master = findShowcaseMaster(masterId, masters);
      setTripletSystem(master?.system ?? resolveMasterDeckSystem(masterId));
      localStorage.setItem(PENDING_MASTER_KEY, masterId);
    },
    [masters]
  );

  const canChangeTripletMaster = useMemo(() => {
    if (newTripletDraft) return true;
    if (!profile) return true;
    return getSpreadForSystem(profile, tripletSystem).length < 3;
  }, [newTripletDraft, profile, tripletSystem]);

  const handleTripletMasterChange = useCallback(
    (masterId: string) => {
      if (!canChangeTripletMaster) return;
      applyTripletMaster(masterId);
    },
    [canChangeTripletMaster, applyTripletMaster]
  );

  const handleTripletBack = useCallback(() => {
    newTripletInProgressRef.current = false;
    setNewTripletDraft(false);
    setTripletNotice(null);
    setStep("masters");
  }, [setStep]);

  useEffect(() => {
    if (step !== "triplet" || masters.length === 0) return;
    if (tripletMasterId && findShowcaseMaster(tripletMasterId, masters)) return;

    const pending = localStorage.getItem(PENDING_MASTER_KEY);
    const fallback = resolveDefaultTripletMasterId(masters, {
      pending,
      recapMasterId: recapContinueMasterId,
      tarotCards: displayTarotCards,
    });
    if (fallback) {
      applyTripletMaster(fallback);
    }
  }, [
    step,
    masters,
    tripletMasterId,
    recapContinueMasterId,
    displayTarotCards,
    applyTripletMaster,
  ]);

  const spreadCardsKey = useMemo(() => spreadKey(displayTarotCards), [displayTarotCards]);

  const chatSpread = useMemo(() => {
    if (!selectedCharacter) return null;
    return resolveMasterSpread(profile, selectedCharacter, masters);
  }, [selectedCharacter, profile, masters]);

  const activeSpreadCardsKey = useMemo(() => {
    if (chatSpread && chatSpread.cards.length >= 3 && chatSpread.cardsKey) {
      return chatSpread.cardsKey;
    }
    return spreadCardsKey;
  }, [chatSpread, spreadCardsKey]);

  const applyDestinyCardToChat = useCallback(
    (url: string, characterId?: string | null) => {
      setChatHeaderImage(url);
      setMessages((prev) => {
        if (!prev.length) return prev;
        const idx = prev.findIndex((m) => m.role === "assistant");
        if (idx === -1) return prev;
        if (prev[idx].sceneImageUrl === url) return prev;
        const updated = prev.map((m, i) =>
          i === idx ? { ...m, sceneImageUrl: url } : m
        );
        const cid = characterId ?? selectedCharacter;
        if (cid) saveChatCache(cid, updated, activeSpreadCardsKey);
        return updated;
      });
    },
    [selectedCharacter, activeSpreadCardsKey]
  );

  useEffect(() => {
    if (!selectedCharacter || !activeSpreadCardsKey) return;

    const firstAssistant = messages.find((m) => m.role === "assistant");
    if (firstAssistant?.sceneImageUrl) {
      setChatHeaderImage((prev) => prev ?? firstAssistant.sceneImageUrl ?? null);
      return;
    }

    const savedUrl = resolveDestinyCardUrl(
      savedReadings,
      activeSpreadCardsKey,
      selectedCharacter
    );
    if (savedUrl) {
      applyDestinyCardToChat(savedUrl, selectedCharacter);
    }
  }, [
    selectedCharacter,
    messages,
    savedReadings,
    activeSpreadCardsKey,
    applyDestinyCardToChat,
  ]);
  const handleOnboardingComplete = async (data: OnboardingData) => {
    if (!isLoggedIn) return;

    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          gender: data.gender,
          birthDate: data.birthDate,
          birthTime: data.birthTime,
          birthCity: data.birthCity,
          lifeFocus: data.lifeFocus,
          mainQuestion: data.mainQuestion,
        }),
      });
    } catch {
      /* сохраним локально даже без сети */
    }

    const existingCards = profile?.tarotCards?.length ? profile.tarotCards : [];

    if (tripletCooldown && !tripletCooldown.allowed) {
      persistProfile({
        ...data,
        tarotCards: existingCards,
        teaser: profile?.teaser,
        userId: profile?.userId,
        name: data.name || authUser?.name || data.name,
      });
      setStep("masters");
      return;
    }
    persistProfile({
      ...data,
      tarotCards: existingCards,
      teaser: profile?.teaser,
      userId: profile?.userId,
      name: data.name || authUser?.name || data.name,
    });
    if (existingCards.length >= 3) {
      setStep("masters");
      return;
    }
    const defaultMaster = resolveDefaultTripletMasterId(masters, {
      pending: localStorage.getItem(PENDING_MASTER_KEY),
      tarotCards: existingCards,
    });
    if (defaultMaster) {
      applyTripletMaster(defaultMaster);
    }
    setStep("triplet");
  };

  const handleTripletComplete = async (cards: SpreadSymbol[], teaser: string) => {
    if (!isLoggedIn) {
      return;
    }

    if (!profile?.birthDate || !profile?.zodiac || !profile?.name) {
      const msg = "Не хватает данных профиля. Заполните анкету заново.";
      setTripletNotice(msg);
      setStep("onboarding");
      return;
    }

    let storedProfile: StoredProfile | null = null;
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) storedProfile = JSON.parse(raw) as StoredProfile;
    } catch {
      storedProfile = null;
    }

    const base = profile ?? storedProfile ?? ({} as StoredProfile);
    const previousCards =
      profile?.tarotCards?.length ? profile.tarotCards : (storedProfile?.tarotCards ?? []);

    const updated: StoredProfile = {
      ...base,
      tarotCards: cards,
      deckSystem: tripletSystem,
      deckSpreads: { ...base.deckSpreads, [tripletSystem]: cards },
      teaser,
    };

    let serverOk = false;
    try {
      const postBody = buildOnboardingPostBody(
        base,
        cards,
        teaser,
        session?.offline ? undefined : session?.sessionId,
        tripletSystem
      );

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postBody),
      });

      const data = (await res.json()) as {
        userId?: string;
        error?: string;
        code?: string;
        step?: string;
        detail?: string;
        missing?: string[];
        message?: string;
        nextAvailableAt?: string | null;
      };

      if (
        (res.status === 429 || data.error === "TRIPLET_COOLDOWN") &&
        data.error === "TRIPLET_COOLDOWN"
      ) {
        newTripletInProgressRef.current = false;
        setNewTripletDraft(false);
        const restored: StoredProfile = {
          ...base,
          tarotCards: previousCards,
          teaser: profile?.teaser ?? storedProfile?.teaser,
        };
        persistProfile(restored);
        setTripletCooldown(
          data.nextAvailableAt
            ? {
                allowed: false,
                nextAvailableAt: data.nextAvailableAt,
                lastTripletAt: tripletCooldown?.lastTripletAt ?? null,
              }
            : tripletCooldownFromLastDraw(new Date())
        );
        if (data.nextAvailableAt) {
          const lastMs =
            new Date(data.nextAvailableAt).getTime() - 24 * 60 * 60 * 1000;
          const lastIso = new Date(lastMs).toISOString();
          writeLocalTripletDrawAt(lastIso);
          persistProfile({ ...restored, lastTripletDrawAt: lastIso });
        }
        setTripletNotice(
          data.nextAvailableAt
            ? `Новый расклад из 3 карт ${formatTripletCooldownRu(data.nextAvailableAt)}`
            : "Новый расклад из 3 карт доступен один раз в сутки"
        );
        setStep("masters");
        return;
      }

      if (res.ok) {
        serverOk = true;
        newTripletInProgressRef.current = false;
        setNewTripletDraft(false);
        clearGuestTriplet();
        if (data.userId) updated.userId = data.userId;
        const drawAt = new Date().toISOString();
        updated.lastTripletDrawAt = drawAt;
        writeLocalTripletDrawAt(drawAt);
        setTripletCooldown(tripletCooldownFromLastDraw(drawAt));
        clearChatCache();
      } else {
        newTripletInProgressRef.current = false;
        setNewTripletDraft(false);
        const restored: StoredProfile = {
          ...base,
          tarotCards: previousCards,
          teaser: profile?.teaser ?? storedProfile?.teaser,
        };
        persistProfile(restored);
        setTripletNotice(onboardingErrorMessage(data));
        if (data.error === "Заполните профиль" || data.code === "MISSING_PROFILE") {
          setStep("onboarding");
        } else {
          setStep(previousCards.length >= 3 ? "masters" : "triplet");
        }
        return;
      }
    } catch {
      /* офлайн: сохраняем локально без смены лимита */
      newTripletInProgressRef.current = false;
    }

    if (!serverOk) {
      setTripletNotice("Расклад сохранён локально. Синхронизация с сервером произойдёт при следующем входе.");
    }

    setNewTripletDraft(false);
    persistProfile(updated);
    setStep("masters");

    const masterToBind =
      tripletMasterId || localStorage.getItem(PENDING_MASTER_KEY);
    if (masterToBind) {
      localStorage.removeItem(PENDING_MASTER_KEY);
      await bindSessionToMaster(masterToBind);
      handleSelectCharacter(masterToBind);
      return;
    }

    if (serverOk && session?.sessionId && !session.offline) {
      await refresh(session.sessionId);
    }
  };

  const getActiveProfile = useCallback((): StoredProfile | null => {
    if (profile && (profile.name || profile.birthDate || (profile.tarotCards?.length ?? 0) > 0)) {
      return profile;
    }
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredProfile;
    } catch {
      return null;
    }
  }, [profile]);

  const handleNewReading = async () => {
    setTripletNotice(null);
    if (
      !tripletCooldownReady ||
      !effectiveTripletCooldown.allowed ||
      tripletCountdown.isOnCooldown
    ) {
      const hint = effectiveTripletCooldown.nextAvailableAt
        ? `Новый расклад из 3 карт ${formatTripletCooldownRu(effectiveTripletCooldown.nextAvailableAt)}`
        : "Новый расклад из 3 карт доступен один раз в сутки";
      setTripletNotice(hint);
      return;
    }
    const synced = await syncProfileFromServer({ keepSpread: true });
    const cooldown = mergeTripletCooldownWithAnchors(
      synced?.cooldown ?? tripletCooldown,
      profile?.lastTripletDrawAt
    );
    if (!cooldown.allowed || tripletCountdown.isOnCooldown) {
      const hint = cooldown?.nextAvailableAt
        ? `Новый расклад из 3 карт ${formatTripletCooldownRu(cooldown.nextAvailableAt)}`
        : "Новый расклад из 3 карт доступен один раз в сутки";
      setTripletNotice(hint);
      setStep("masters");
      return;
    }
    const base = synced?.profile ?? profile ?? getActiveProfile();
    if (!base?.birthDate) {
      setStep("onboarding");
      return;
    }
    readingInFlightRef.current = false;
    localStorage.removeItem(LAST_MASTER_KEY);
    setLastMasterId(null);
    setSelectedCharacter(null);
    setMessages([]);
    setShowPaywall(false);
    setShowRuneShop(false);
    setInsufficientRunes(null);
    setChatHeaderImage(null);
    const defaultMaster = resolveDefaultTripletMasterId(masters, {
      pending: localStorage.getItem(PENDING_MASTER_KEY),
      recapMasterId: recapContinueMasterId,
      tarotCards: displayTarotCards,
    });
    if (defaultMaster) {
      applyTripletMaster(defaultMaster);
    } else {
      localStorage.removeItem(PENDING_MASTER_KEY);
    }
    newTripletInProgressRef.current = true;
    setNewTripletDraft(true);
    setStep("triplet");
  };

  useEffect(() => {
    if (step !== "onboarding" || !tripletCooldownReady || !tripletCooldown || tripletCooldown.allowed) {
      return;
    }
    if (displayTarotCards.length < 3) return;
    const hint = tripletCooldown.nextAvailableAt
      ? `Новый расклад из 3 карт ${formatTripletCooldownRu(tripletCooldown.nextAvailableAt)}`
      : "Новый расклад из 3 карт доступен один раз в сутки";
    setTripletNotice(hint);
    setStep("masters");
  }, [step, tripletCooldownReady, tripletCooldown, displayTarotCards.length, setStep]);

  const startPersonalFlow = useCallback(async () => {
    if (!isLoggedIn) {
      window.location.href = `/auth/user/register?returnTo=${encodeURIComponent("/")}`;
      return;
    }
    setTripletNotice(null);
    const synced = await syncProfileFromServer({ keepSpread: true });
    const base = synced?.profile ?? profile ?? getActiveProfile();
    const mergedGuest = base ? mergeGuestTripletIntoProfile(base) : null;
    if (mergedGuest && mergedGuest !== base) {
      persistProfile(mergedGuest as StoredProfile);
    }
    const effectiveBase = mergedGuest ?? base;
    const cooldown = synced?.cooldown ?? tripletCooldown;
    const hasSpread =
      (effectiveBase?.tarotCards?.length ?? 0) >= 3 || displayTarotCards.length >= 3;
    if (effectiveBase?.birthDate && cooldown && !cooldown.allowed && hasSpread) {
      const hint = cooldown.nextAvailableAt
        ? `Новый расклад из 3 карт ${formatTripletCooldownRu(cooldown.nextAvailableAt)}`
        : "Новый расклад из 3 карт доступен один раз в сутки";
      setTripletNotice(hint);
      setStep("masters");
      return;
    }
    if (effectiveBase?.birthDate && hasSpread) {
      setStep("masters");
      return;
    }
    if (effectiveBase?.birthDate) {
      const defaultMaster = resolveDefaultTripletMasterId(masters, {
        pending: localStorage.getItem(PENDING_MASTER_KEY),
        tarotCards: effectiveBase?.tarotCards,
      });
      if (defaultMaster) {
        applyTripletMaster(defaultMaster);
      }
      setStep("triplet");
      return;
    }
    if (hasSpread) {
      setStep("onboarding");
      return;
    }
    setStep("onboarding");
  }, [
    isLoggedIn,
    syncProfileFromServer,
    profile,
    getActiveProfile,
    tripletCooldown,
    displayTarotCards.length,
    setStep,
  ]);

  const attachSceneToAssistantMessage = useCallback(
    async (
      messageId: string,
      content: string,
      characterId: string,
      scene: "destiny_card" | "scene_illustration",
      userQuestion?: string
    ) => {
      const activeProfile = getActiveProfile();
      if (!activeProfile) return;

      const url = await requestSceneImage({
        scene,
        characterKey: masterVisualKey(characterId),
        userName: activeProfile.name,
        zodiac: activeProfile.zodiac,
        cards: tarotCardNames(activeProfile.tarotCards),
        userQuestionText: scene === "scene_illustration" ? userQuestion : undefined,
        aiResponseText: scene === "scene_illustration" ? content : undefined,
      });

      if (!url) return;

      if (scene === "destiny_card") {
        setChatHeaderImage(url);
      }

      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === messageId ? { ...m, sceneImageUrl: url } : m
        );
        const ctx = resolveMasterSpread(activeProfile, characterId, masters);
        const key = ctx.cards.length >= 3 ? ctx.cardsKey : spreadCardsKey;
        saveChatCache(characterId, updated, key);
        return updated;
      });
    },
    [getActiveProfile, spreadCardsKey, masters]
  );

  useEffect(() => {
    if (sessionOnlyChat) return;
    if (!selectedCharacter || !activeSpreadCardsKey) return;

    const firstAssistant = messages.find((m) => m.role === "assistant");
    if (!firstAssistant || firstAssistant.sceneImageUrl) return;
    if (resolveDestinyCardUrl(savedReadings, activeSpreadCardsKey, selectedCharacter)) return;
    if (!firstAssistant.content || firstAssistant.content.length < 40) return;

    const backfillKey = `${selectedCharacter}|${activeSpreadCardsKey}`;
    if (destinyBackfillRef.current === backfillKey) return;
    destinyBackfillRef.current = backfillKey;

    void attachSceneToAssistantMessage(
      firstAssistant.id,
      firstAssistant.content,
      selectedCharacter,
      "destiny_card"
    ).then(() => refreshSavedReadings());
  }, [
    selectedCharacter,
    activeSpreadCardsKey,
    messages,
    savedReadings,
    attachSceneToAssistantMessage,
    refreshSavedReadings,
    sessionOnlyChat,
  ]);

  const loadReading = useCallback(
    async (characterId: string) => {
      try {
        const activeProfile = getActiveProfile();
        if (!activeProfile?.tarotCards?.length) return;

        const masterCtx = resolveMasterSpread(activeProfile, characterId, masters);
        const cardsForMaster =
          masterCtx.cards.length >= 3 ? masterCtx.cards : activeProfile.tarotCards;
        const cardsKey = spreadKey(cardsForMaster) || spreadCardsKey;
        const cachedReading = savedReadings.find(
          (row) =>
            row.characterName === characterId &&
            row.contextData?.type === "reading" &&
            typeof row.contextData.reading === "string" &&
            spreadKey(row.contextData.tarotCards) === cardsKey
        );

        if (cachedReading?.contextData?.reading) {
          const readingText = cachedReading.contextData.reading as string;
          const readingTs = cachedReading.createdAt
            ? new Date(cachedReading.createdAt)
            : new Date();
          const readingMsgId = generateId();
          const readingMsg: Message = {
            id: readingMsgId,
            role: "assistant",
            content: readingText,
            timestamp: readingTs,
          };
          setMessages([readingMsg]);
          saveChatCache(characterId, [readingMsg], cardsKey);
          const savedUrl = resolveDestinyCardUrl(savedReadings, cardsKey, characterId);
          if (savedUrl) {
            applyDestinyCardToChat(savedUrl, characterId);
          } else {
            void attachSceneToAssistantMessage(
              readingMsgId,
              readingText,
              characterId,
              "destiny_card"
            ).then(() => refreshSavedReadings());
          }
          return;
        }

        setIsLoading(true);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 55000);

        try {
          const res = await fetch("/api/reading", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              characterId,
              sessionId: session?.offline ? undefined : session?.sessionId,
              ...profileApiPayload(activeProfile, characterId, masters),
            }),
          });
          const data = await res.json();
          if (res.status === 401) {
            setMessages([
              {
                id: generateId(),
                role: "assistant",
                content: "Для расшифровки нужна регистрация. Создайте аккаунт и начните расклад заново.",
                timestamp: new Date(),
              },
            ]);
            return;
          }
          if (res.status === 402 && data.error === "INSUFFICIENT_RUNES") {
            const required = data.required ?? runeCost("READING");
            pendingReadingMasterRef.current = characterId;
            persistPendingReading(characterId, required);
            setInsufficientRunes({
              balance: data.balance ?? 0,
              required,
            });
            setMessages([
              {
                id: generateId(),
                role: "assistant",
                content: `Для полной расшифровки нужно ${formatRunes(required)}. Пополните баланс — расшифровка начнётся автоматически.`,
                timestamp: new Date(),
              },
            ]);
            setShowRuneShop(true);
            return;
          }
          if (typeof data.runeBalance === "number") {
            setRuneBalance(data.runeBalance);
            emitRuneBalanceUpdate(data.runeBalance);
            if (session?.sessionId && !session.offline) {
              void refresh(session.sessionId);
            }
          }
          if (res.ok && data.reading) {
            clearPendingReading();
            pendingReadingMasterRef.current = null;
            const readingMsgId = generateId();
            const readingTs = data.createdAt ? new Date(data.createdAt) : new Date();
            const readingMsg: Message = {
              id: readingMsgId,
              role: "assistant",
              content: data.reading,
              timestamp: readingTs,
            };
            setMessages([readingMsg]);
            saveChatCache(characterId, [readingMsg], cardsKey);
            refreshSavedReadings();
            const savedUrl = resolveDestinyCardUrl(
              savedReadings,
              cardsKey,
              characterId
            );
            if (savedUrl) {
              applyDestinyCardToChat(savedUrl, characterId);
            } else {
              void attachSceneToAssistantMessage(
                readingMsgId,
                data.reading,
                characterId,
                "destiny_card"
              ).then(() => refreshSavedReadings());
            }
          } else {
            setMessages([
              {
                id: generateId(),
                role: "assistant",
                content: buildTeaser(activeProfile),
                timestamp: new Date(),
              },
            ]);
          }
        } finally {
          clearTimeout(timeout);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("loadReading failed:", err);
        setMessages([
          {
            id: generateId(),
            role: "assistant",
            content: "Мастер на связи. Задайте ваш вопрос.",
            timestamp: new Date(),
          },
        ]);
        setIsLoading(false);
      }
    },
    [getActiveProfile, session?.offline, session?.sessionId, attachSceneToAssistantMessage, refreshSavedReadings, spreadCardsKey, runeCost, savedReadings, applyDestinyCardToChat, masters]
  );

  const restoreChatForCharacter = useCallback(
    async (characterId: string): Promise<Message[] | null> => {
      const activeProfile = getActiveProfile();
      const masterCtx = resolveMasterSpread(activeProfile, characterId, masters);
      const cacheKey =
        masterCtx.cards.length >= 3 ? masterCtx.cardsKey : spreadCardsKey;
      const cached = loadChatCache(characterId, cacheKey);
      if (cached?.length && chatHasSpreadReading(cached)) return cached;

      const cardsForMaster =
        masterCtx.cards.length >= 3 ? masterCtx.cards : activeProfile?.tarotCards;
      const cardsKey = spreadKey(cardsForMaster) || spreadCardsKey;

      try {
        const params = new URLSearchParams({ characterId });
        if (session?.sessionId && !session.offline) {
          params.set("sessionId", session.sessionId);
        }
        if (cardsKey) params.set("cardsKey", cardsKey);

        const res = await fetch(`/api/chat/history?${params}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.messages?.length) return null;

        const restored: Message[] = data.messages.map(
          (m: { id: string; role: string; content: string; timestamp: string }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.timestamp),
          })
        );

        if (!chatHasSpreadReading(restored)) return null;

        saveChatCache(characterId, restored, cacheKey);
        return restored;
      } catch {
        return null;
      }
    },
    [getActiveProfile, session?.offline, session?.sessionId, spreadCardsKey, masters]
  );

  useEffect(() => {
    if (!selectedCharacter || sessionLoading || authLoading || !isLoggedIn) return;
    if (messages.length > 0) return;
    if (readingInFlightRef.current) return;
    if (skipNextReadingRef.current) {
      skipNextReadingRef.current = false;
      return;
    }

    const cached = loadChatCache(selectedCharacter, activeSpreadCardsKey);
    if (cached?.length) {
      if (chatHasSpreadReading(cached) || sessionOnlyChat) {
        setMessages(cached);
        return;
      }
    }

    readingInFlightRef.current = true;
    void (async () => {
      try {
        if (sessionOnlyChat) {
          const restored = await restoreChatForCharacter(selectedCharacter);
          if (restored?.length) {
            setMessages(restored);
            return;
          }
          const master =
            findShowcaseMaster(selectedCharacter, masters) ??
            getCharacterById(selectedCharacter);
          const masterName = master?.name ?? "Мастер";
          setMessages([
            {
              id: generateId(),
              role: "assistant",
              content: `${masterName} готов к сеансу. Задайте свой вопрос — этот диалог не привязан к вашему раскладу из трёх карт.`,
              timestamp: new Date(),
            },
          ]);
          return;
        }

        const restored = await restoreChatForCharacter(selectedCharacter);
        if (restored?.length && chatHasSpreadReading(restored)) {
          setMessages(restored);
          return;
        }
        await loadReading(selectedCharacter);
      } finally {
        readingInFlightRef.current = false;
      }
    })();
  }, [
    selectedCharacter,
    sessionLoading,
    authLoading,
    isLoggedIn,
    messages.length,
    sessionOnlyChat,
    loadReading,
    restoreChatForCharacter,
    masters,
    activeSpreadCardsKey,
  ]);

  useEffect(() => {
    if (selectedCharacter && messages.length && chatHasSpreadReading(messages)) {
      saveChatCache(selectedCharacter, messages, activeSpreadCardsKey);
    }
  }, [selectedCharacter, messages, activeSpreadCardsKey]);

  const openChatWithCharacter = useCallback(
    async (
      characterId: string,
      options?: { forceNew?: boolean; sessionOnly?: boolean }
    ) => {
      if (!isLoggedIn) return;

      if (options?.sessionOnly !== undefined) {
        setSessionOnlyChat(options.sessionOnly);
      }

      localStorage.setItem(LAST_MASTER_KEY, characterId);
      localStorage.setItem(FLOW_STEP_KEY, "chat");
      setLastMasterId(characterId);
      setStep("chat");
      setSelectedCharacter(characterId);

      if (!options?.forceNew) {
        const restored = await restoreChatForCharacter(characterId);
        if (restored?.length && chatHasSpreadReading(restored)) {
          skipNextReadingRef.current = true;
          setMessages(restored);
          return;
        }
      }

      setMessages([]);
    },
    [isLoggedIn, restoreChatForCharacter, setStep]
  );

  useEffect(() => {
    if (authLoading || !isLoggedIn || selectedCharacter || autoResumeDoneRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const continueMaster = params.get("master") ?? params.get("continue");
    if (!continueMaster) return;

    autoResumeDoneRef.current = true;

    const activeProfile = getActiveProfile();
    const hasSpread =
      (activeProfile?.tarotCards?.length ?? 0) >= 3 || displayTarotCards.length >= 3;

    if (!hasSpread) {
      localStorage.setItem(PENDING_MASTER_KEY, continueMaster);
      applyTripletMaster(continueMaster);
      if (activeProfile?.birthDate) {
        setStep("triplet");
      } else {
        setStep("onboarding");
      }
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    void openChatWithCharacter(continueMaster, {
      sessionOnly:
        spreadReadingDone && !continueMasterIds.includes(continueMaster),
    });
  }, [
    authLoading,
    isLoggedIn,
    selectedCharacter,
    openChatWithCharacter,
    spreadReadingDone,
    continueMasterIds,
    getActiveProfile,
    displayTarotCards.length,
    setStep,
  ]);

  useEffect(() => {
    if (authLoading || !isLoggedIn) return;
    if (step === "triplet" || step === "onboarding") return;

    const pending = readPendingReading();
    if (!pending) {
      pendingReadingResumeRef.current = null;
      return;
    }

    const resumeKey = `${pending.masterId}:${pending.required}`;
    if (pendingReadingResumeRef.current === resumeKey) return;

    void (async () => {
      try {
        const res = await fetch("/api/runes/balance");
        if (!res.ok) return;
        const data = await res.json();
        const balance = typeof data.balance === "number" ? data.balance : 0;
        setRuneBalance(balance);
        emitRuneBalanceUpdate(balance);

        if (pending.required > 0 && balance < pending.required) return;

        pendingReadingResumeRef.current = resumeKey;
        pendingReadingMasterRef.current = null;
        setInsufficientRunes(null);

        if (selectedCharacter === pending.masterId && step === "chat") {
          if (!chatHasSpreadReading(messages)) {
            readingInFlightRef.current = true;
            try {
              await loadReading(pending.masterId);
              clearPendingReading();
            } finally {
              readingInFlightRef.current = false;
            }
          } else {
            clearPendingReading();
          }
          return;
        }

        void openChatWithCharacter(pending.masterId);
      } catch {
        pendingReadingResumeRef.current = null;
      }
    })();
  }, [authLoading, isLoggedIn, selectedCharacter, step, messages, loadReading, openChatWithCharacter]);

  const bindSessionToMaster = useCallback(
    async (masterId: string) => {
      if (!session?.sessionId || session.offline) return;

      const referrerSlugValue = !isAiMasterId(masterId)
        ? masterId
        : referrerSlug
          ? referrerSlug
          : null;

      try {
        await fetch("/api/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: session.sessionId,
            referrerSlug: referrerSlugValue,
          }),
        });
        await refresh(session.sessionId);
      } catch {
        /* offline ok */
      }
    },
    [referrerSlug, refresh, session?.offline, session?.sessionId]
  );

  const handleSelectCharacter = (characterId: string) => {
    void openChatWithCharacter(characterId);
  };

  useEffect(() => {
    if (authLoading || !isLoggedIn) return;
    if (step !== "masters" || selectedCharacter) return;

    const pendingMaster = localStorage.getItem(PENDING_MASTER_KEY);
    if (!pendingMaster) return;

    const activeProfile = getActiveProfile();
    if ((activeProfile?.tarotCards?.length ?? 0) < 3 && displayTarotCards.length < 3) return;

    localStorage.removeItem(PENDING_MASTER_KEY);
    void bindSessionToMaster(pendingMaster).then(() => {
      handleSelectCharacter(pendingMaster);
    });
  }, [
    authLoading,
    isLoggedIn,
    step,
    selectedCharacter,
    getActiveProfile,
    displayTarotCards.length,
    bindSessionToMaster,
  ]);

  const handleRuneShopClose = useCallback(async () => {
    setShowRuneShop(false);
    const masterId = pendingReadingMasterRef.current;
    const required = insufficientRunes?.required;
    if (!masterId || !required) return;

    try {
      const res = await fetch("/api/runes/balance");
      if (!res.ok) return;
      const data = await res.json();
      const balance = typeof data.balance === "number" ? data.balance : 0;
      setRuneBalance(balance);
      emitRuneBalanceUpdate(balance);

      if (balance >= required) {
        pendingReadingMasterRef.current = null;
        clearPendingReading();
        setInsufficientRunes(null);
        readingInFlightRef.current = true;
        try {
          await loadReading(masterId);
        } finally {
          readingInFlightRef.current = false;
        }
      }
    } catch {
      /* пользователь может повторить вручную */
    }
  }, [insufficientRunes?.required, loadReading]);

  const handleMasterPick = async (masterId: string) => {
    localStorage.setItem(PENDING_MASTER_KEY, masterId);

    if (!isLoggedIn) {
      window.location.href = `/auth/user/register?returnTo=${encodeURIComponent("/#наставники")}`;
      return;
    }

    const activeProfile = getActiveProfile();
    if (!activeProfile?.birthDate && !profile?.birthDate) {
      setStep("onboarding");
      return;
    }

    const master = findShowcaseMaster(masterId, masters);
    const system = master?.system ?? resolveMasterDeckSystem(masterId);
    const masterSpread = getSpreadForSystem(activeProfile ?? profile, system);

    if (masterSpread.length < 3) {
      if (tripletCooldownReady && !effectiveTripletCooldown.allowed) {
        const hint = effectiveTripletCooldown.nextAvailableAt
          ? `Новый расклад из 3 карт ${formatTripletCooldownRu(effectiveTripletCooldown.nextAvailableAt)}`
          : "Новый расклад из 3 карт доступен один раз в сутки";
        setTripletNotice(hint);
        return;
      }
      setTripletNotice(null);
      applyTripletMaster(masterId);
      setStep("triplet");
      return;
    }

    if (profile && (profile.deckSystem !== system || profile.tarotCards !== masterSpread)) {
      persistProfile({
        ...profile,
        tarotCards: masterSpread,
        deckSystem: system,
      });
    }

    localStorage.removeItem(PENDING_MASTER_KEY);
    setSessionOnlyChat(
      spreadReadingDone && !continueMasterIds.includes(masterId)
    );
    await bindSessionToMaster(masterId);
    handleSelectCharacter(masterId);
  };

  const handleCloseChat = () => {
    if (selectedCharacter && messages.length) {
      saveChatCache(selectedCharacter, messages, activeSpreadCardsKey);
    }
    readingInFlightRef.current = false;
    setSessionOnlyChat(false);
    setSelectedCharacter(null);
    setStep("masters");
    refreshSavedReadings();
  };

  const handlePhotoContinueChat = async (
    masterId: string,
    payload: { analysis: string; question?: string; detectedCards: string[] }
  ) => {
    if (!isLoggedIn) return;

    const chatMessages = buildPhotoReadingChatMessages(
      payload.analysis,
      payload.question ?? "",
      payload.detectedCards
    );

    saveChatCache(masterId, chatMessages);
    skipNextReadingRef.current = true;
    readingInFlightRef.current = false;

    await bindSessionToMaster(masterId);

    localStorage.setItem(LAST_MASTER_KEY, masterId);
    localStorage.setItem(FLOW_STEP_KEY, "chat");
    setLastMasterId(masterId);
    setStep("chat");
    setSelectedCharacter(masterId);
    setMessages(chatMessages);
  };

  const handleSendMessage = async (content: string, imageBase64?: string) => {
    if (!selectedCharacter || !content.trim() || !isLoggedIn || sendingRef.current) return;

    if (session?.offline) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "assistant",
          content: "Сессия не синхронизирована с сервером. Обновите страницу и попробуйте снова.",
          timestamp: new Date(),
        },
      ]);
      return;
    }

    sendingRef.current = true;

    const activeProfile = getActiveProfile();

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };

    const outgoing = [...messages, userMessage];
    setMessages(outgoing);
    setIsLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          characterId: selectedCharacter,
          sessionId: session?.offline ? undefined : session?.sessionId,
          messages: outgoing.map((m) => ({ role: m.role, content: m.content })),
          imageBase64,
          userProfile: activeProfile
            ? {
                name: activeProfile.name,
                gender: activeProfile.gender === "male" ? "Мужской" : "Женский",
                zodiac: activeProfile.zodiac,
                birthDate: activeProfile.birthDate,
                birthTime: activeProfile.birthTime,
                birthCity: activeProfile.birthCity,
                lifeFocus: activeProfile.lifeFocus,
                mainQuestion: activeProfile.mainQuestion,
                astroMeta: activeProfile.astroMeta,
              }
            : undefined,
          tarotCards: activeProfile?.tarotCards,
        }),
      });

      if (response.status === 401) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          {
            id: generateId(),
            role: "assistant",
            content: "Для чата с мастером нужна регистрация. Войдите или создайте аккаунт.",
            timestamp: new Date(),
          },
        ]);
        return;
      }

      if (response.status === 402) {
        const errData = await response.json().catch(() => ({}));
        if (errData.error === "INSUFFICIENT_RUNES") {
          setInsufficientRunes({
            balance: errData.balance ?? 0,
            required: errData.required ?? 10,
          });
          setShowRuneShop(true);
          setMessages((prev) => prev.slice(0, -1));
          return;
        }
        setShowPaywall(true);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Chat failed");
      }

      if (typeof data.runeBalance === "number") {
        setRuneBalance(data.runeBalance);
        emitRuneBalanceUpdate(data.runeBalance);
        setInsufficientRunes(null);
      }

      const replyId = generateId();
      const reply =
        data.reply ?? "Энергии сегодня нестабильны. Попробуйте позже.";

      setMessages((prev) => [
        ...prev,
        {
          id: replyId,
          role: "assistant",
          content: reply,
          timestamp: new Date(),
        },
      ]);

      if (!data.llmFailed) {
        void attachSceneToAssistantMessage(
          replyId,
          reply,
          selectedCharacter,
          "scene_illustration",
          content.trim()
        );
      }

      if (session?.sessionId && !session.offline) {
        await refresh(session.sessionId);
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "assistant",
          content: aborted
            ? "Мастер думал слишком долго — повторите вопрос."
            : "Связь с астральным планом прервана. Повторите вопрос.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      clearTimeout(timeout);
      setIsLoading(false);
      sendingRef.current = false;
    }
  };

  const usesRuneBilling =
    isLoggedIn && !session?.hasAccess && !session?.offline && runeConfig.enabled;

  const questionsLeft =
    session?.offline || session?.hasAccess
      ? null
      : (session?.questionsRemaining ??
        Math.max(
          0,
          (session?.freeLimit ?? runeConfig.freeQuestions) - (session?.freeQuestionsUsed ?? 0)
        ));

  const recommendedId =
    profile?.tarotCards?.length && masters.length
      ? recommendShowcaseMaster(profile.tarotCards, masters)
      : undefined;

  const tripletMasterName = useMemo(() => {
    const id = tripletMasterId || recapContinueMasterId || recommendedId;
    if (!id) return undefined;
    return findShowcaseMaster(id, masters)?.name ?? getCharacterById(id)?.name;
  }, [tripletMasterId, recapContinueMasterId, recommendedId, masters]);

  const selectedMaster = selectedCharacter
    ? findShowcaseMaster(selectedCharacter, masters)
    : undefined;

  const effectiveProfile = useMemo((): StoredProfile => {
    const stored = profile ?? readStoredProfile();
    if (stored && (stored.name || stored.birthDate || (stored.tarotCards?.length ?? 0) > 0)) {
      return stored;
    }
    return {
      name: authUser?.name ?? stored?.name ?? "Гость",
      gender: stored?.gender ?? "female",
      birthDate: stored?.birthDate ?? "",
      zodiac: stored?.zodiac ?? "",
      tarotCards: stored?.tarotCards ?? [],
      deckSystem: stored?.deckSystem,
      deckSpreads: stored?.deckSpreads,
      teaser: stored?.teaser,
      userId: stored?.userId,
    };
  }, [profile, authUser?.name]);

  const showLanding = step === "intro";
  const inPersonalFlow = isLoggedIn && step !== "intro";
  const bootstrapping = sessionLoading || authLoading;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
          <motion.div
            className="flex min-w-0 shrink items-center gap-1.5 sm:gap-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Sparkles className="h-6 w-6 shrink-0 text-aura-purple sm:h-7 sm:w-7" />
            <div className="min-w-0">
              <span className="font-display text-xl font-bold tracking-wider text-white neon-text sm:text-2xl">
                Aura
              </span>
              <span className="ml-2 hidden text-xs text-gray-600 sm:inline">эзотерический оракул</span>
            </div>
          </motion.div>

          <nav className="hidden items-center gap-8 md:flex">
            {[
              { label: photoNavLabel, action: openPhotoReading },
              { label: "Мастера", id: "наставники" },
              { label: "Колоды", action: openDecksModal },
              { label: "Тарифы", id: "тарифы" },
            ].map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={() =>
                  "action" in link && link.action
                    ? link.action()
                    : scrollToSection(link.id!)
                }
                className="text-sm text-gray-400 transition-colors hover:text-aura-neon"
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
            <button
              type="button"
              onClick={() => void startPersonalFlow()}
              className="btn-primary hidden px-4 py-2 text-xs sm:inline-flex sm:text-sm"
            >
              Получить расклад
            </button>
            <button
              type="button"
              onClick={openPhotoReading}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-gray-300 transition-colors hover:border-aura-gold/30 hover:text-white md:hidden"
              aria-label={photoNavLabel}
            >
              <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="max-[360px]:hidden">Фото</span>
            </button>
            <button
              type="button"
              onClick={openDecksModal}
              className="flex items-center gap-1 rounded-lg border border-aura-gold/25 bg-aura-gold/5 px-2 py-1.5 text-[11px] text-aura-champagne transition-colors hover:border-aura-gold/45 hover:bg-aura-gold/10 md:hidden"
              aria-label="Колоды мастеров"
            >
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="max-[360px]:hidden">Колоды</span>
            </button>
            {isLoggedIn && (
              <RuneBalance compact onBuyClick={() => setShowRuneShop(true)} />
            )}
            <AuthHeader compact />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8 md:py-12">
        {bootstrapping ? (
          <AppBootstrapScreen embedded />
        ) : selectedCharacter && !isLoggedIn ? (
          <RegisterGate
            compact
            title="Войдите для продолжения сеанса"
            description="Аккаунт нужен, чтобы сохранить переписку с мастером и историю раскладов."
          />
        ) : selectedCharacter ? (
          <ChatWindow
            characterId={selectedCharacter}
            master={
              selectedMaster
                ? { name: selectedMaster.name, title: selectedMaster.title, emoji: selectedMaster.emoji }
                : undefined
            }
            messages={messages}
            isLoading={isLoading}
            questionsLeft={questionsLeft}
            hasFullAccess={session?.hasAccess ?? false}
            usesRuneBilling={usesRuneBilling}
            questionCost={runeCost("QUESTION")}
            insufficientRunes={insufficientRunes}
            onOpenRuneShop={() => setShowRuneShop(true)}
            headerSceneUrl={sessionOnlyChat ? null : chatHeaderImage}
            spreadCards={
              sessionOnlyChat
                ? undefined
                : chatSpread && chatSpread.cards.length >= 3
                  ? chatSpread.cards
                  : displayTarotCards
            }
            spreadDeckSystem={
              chatSpread && chatSpread.cards.length >= 3
                ? chatSpread.system
                : profile?.deckSystem ?? DEFAULT_DECK_SYSTEM
            }
            onSendMessage={handleSendMessage}
            onClose={handleCloseChat}
            sessionOffline={Boolean(session?.offline)}
            onReconnectSession={reconnecting ? undefined : () => void handleReconnectSession()}
            onOpenPaywall={() => setShowPaywall(true)}
          />
        ) : inPersonalFlow ? (
          <div className={step === "masters" ? "mx-auto max-w-7xl" : "mx-auto max-w-4xl"}>

            {step === "onboarding" && (
              <section className="mb-12">
                <OnboardingForm
                  initialName={authUser?.name ?? profile?.name}
                  onComplete={handleOnboardingComplete}
                />
              </section>
            )}

            {step === "triplet" && (
              <section className="flow-panel mb-12">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleTripletBack}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-aura-gold/25 hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    На главную
                  </button>
                  {masters.length > 0 &&
                  tripletMasterId &&
                  (!tripletCooldown || tripletCooldown.allowed) ? (
                    <MasterSelect
                      masters={masters}
                      value={tripletMasterId}
                      onChange={handleTripletMasterChange}
                      disabled={!canChangeTripletMaster}
                      className="ml-auto"
                    />
                  ) : null}
                </div>
                {tripletNotice ? (
                  <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100 backdrop-blur-md">
                    {tripletNotice}
                  </div>
                ) : null}
                {tripletCooldown && !tripletCooldown.allowed ? (
                  <div className="glass-panel mx-auto max-w-xl p-8 text-center">
                    <p className="mb-2 font-display text-lg font-semibold text-white">
                      Новый расклад из 3 карт
                    </p>
                    <p className="mb-6 text-sm text-gray-400">
                      Доступен один раз в сутки. {tripletCooldownHint ?? "Попробуйте позже."}
                    </p>
                    <button
                      type="button"
                      onClick={handleTripletBack}
                      className="btn-neon px-6 py-2.5 text-sm"
                    >
                      К мастерам и текущему раскладу
                    </button>
                  </div>
                ) : (
                  <>
                    {!canChangeTripletMaster ? (
                      <p className="mb-4 text-center text-[11px] text-gray-500">
                        Расклад уже выпал — сменить мастера можно после нового расклада
                      </p>
                    ) : null}
                    <TarotTriplet
                      key={
                        newTripletDraft
                          ? `new-triplet-${tripletMasterId}-${tripletSystem}`
                          : `triplet-${tripletMasterId}-${tripletSystem}`
                      }
                      userName={effectiveProfile.name}
                      zodiac={effectiveProfile.zodiac}
                      system={tripletSystem}
                      masterName={tripletMasterName}
                      initialCards={
                        newTripletDraft
                          ? undefined
                          : getSpreadForSystem(effectiveProfile, tripletSystem).length >= 3
                            ? getSpreadForSystem(effectiveProfile, tripletSystem)
                            : displayTarotCards
                      }
                      onComplete={handleTripletComplete}
                    />
                    {newTripletDraft && displayTarotCards.length >= 3 ? (
                      <div className="mt-6 text-center">
                        <button
                          type="button"
                          onClick={handleTripletBack}
                          className="text-sm text-gray-500 underline-offset-2 hover:text-gray-300 hover:underline"
                        >
                          Отмена — оставить текущий расклад
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            )}

            {step === "masters" && (
              <>
                {showWelcomeBack && recapContinueMasterId ? (
                  <WelcomeBackBanner
                    userName={effectiveProfile.name}
                    masterId={recapContinueMasterId}
                    masters={masters}
                    onContinue={(masterId) => {
                      setShowWelcomeBack(false);
                      void handleMasterPick(masterId);
                    }}
                  />
                ) : null}
                {tripletNotice ? (
                  <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100 backdrop-blur-md">
                    {tripletNotice}
                  </div>
                ) : null}
                <ReadingRecap
                  userName={effectiveProfile.name || authUser?.name || "Гость"}
                  birthDate={effectiveProfile.birthDate}
                  tarotCards={displayTarotCards}
                  deckSystem={effectiveProfile.deckSystem ?? tripletSystem}
                  teaser={effectiveProfile.teaser}
                  lastMasterId={recapContinueMasterId}
                  masters={masters}
                  onContinue={
                    recapContinueMasterId
                      ? () => void handleMasterPick(recapContinueMasterId)
                      : undefined
                  }
                  onNewReading={handleNewReading}
                  cooldownReady={tripletCooldownReady}
                  cooldownAllowed={effectiveTripletCooldown.allowed}
                  nextAvailableAt={effectiveTripletCooldown.nextAvailableAt}
                  onUnlock={
                    session?.sessionId && !session.hasAccess && !runeConfig.enabled
                      ? () => setShowPaywall(true)
                      : undefined
                  }
                  unlockLabel={
                    runeConfig.enabled
                      ? formatRunes(runeCost("READING"))
                      : "199 ₽"
                  }
                  readingHint={
                    runeConfig.enabled
                      ? `Расшифровка у мастера — ${formatRunes(runeCost("READING"))} · вопросы после ${runeConfig.freeQuestions} бесплатных — ${formatRunes(runeCost("QUESTION"))}`
                      : undefined
                  }
                  onOpenGallery={() => {
                    setDeckGalleryOpen(true);
                    requestAnimationFrame(() => {
                      document.getElementById("колода")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}
                />

                {deckGalleryOpen && (profile || browseDeckMaster) && (
                  <DeckGallery
                    system={
                      browseDeckMaster
                        ? (browseDeckMaster.system ?? resolveMasterDeckSystem(browseDeckMaster.id))
                        : (profile?.deckSystem ?? tripletSystem)
                    }
                    masterName={
                      browseDeckMaster?.name ??
                      findShowcaseMaster(recapContinueMasterId ?? recommendedId ?? "", masters)?.name ??
                      getCharacterById(recommendedId ?? "")?.name ??
                      "мастера"
                    }
                    masterId={
                      browseDeckMaster?.id ??
                      recapContinueMasterId ??
                      recommendedId ??
                      undefined
                    }
                    onBack={() => {
                      setDeckGalleryOpen(false);
                      if (browseDeckMaster) {
                        setBrowseDeckMaster(null);
                        setShowDecksModal(true);
                      } else {
                        document.getElementById("мой-расклад")?.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                    backLabel={browseDeckMaster ? "К колодам мастеров" : "К моему раскладу"}
                  />
                )}

                <AuraSellingLanding
                  isLoggedIn={isLoggedIn}
                  masters={masters}
                  onStartReading={() => void startPersonalFlow()}
                  onSelectMaster={(id) => void handleMasterPick(id)}
                  onBrowseDeck={handleBrowseDeck}
                  recommendedId={recommendedId}
                  continueMasterIds={continueMasterIds}
                  spreadReadingDone={spreadReadingDone}
                  showHero={false}
                  showTariffs
                  onOpenPaywall={() => setShowPaywall(true)}
                  onOpenRuneShop={() => setShowRuneShop(true)}
                />
              </>
            )}
          </div>
        ) : showLanding ? (
          <>
            <AuraSellingLanding
              isLoggedIn={isLoggedIn}
              masters={masters}
              onStartReading={() => void startPersonalFlow()}
              onSelectMaster={(id) => void handleMasterPick(id)}
              onBrowseDeck={handleBrowseDeck}
              recommendedId={recommendedId}
              continueMasterIds={continueMasterIds}
              spreadReadingDone={spreadReadingDone}
              showHero
              showMasters
              showTariffs
              onOpenPaywall={() => setShowPaywall(true)}
              onOpenRuneShop={() => setShowRuneShop(true)}
            />

            {deckGalleryOpen && browseDeckMaster && (
              <DeckGallery
                system={
                  browseDeckMaster.system ?? resolveMasterDeckSystem(browseDeckMaster.id)
                }
                masterName={browseDeckMaster.name}
                masterId={browseDeckMaster.id}
                onBack={() => {
                  setDeckGalleryOpen(false);
                  setBrowseDeckMaster(null);
                  setShowDecksModal(true);
                }}
                backLabel="К колодам мастеров"
              />
            )}
          </>
        ) : null}
      </main>

      <PhotoReadingFlow
        open={photoReadingOpen}
        onClose={closePhotoReading}
        masters={masters}
        isLoggedIn={isLoggedIn}
        defaultMasterId={lastMasterId ?? recommendedId ?? "veronika"}
        sessionId={session?.offline ? undefined : session?.sessionId}
        userName={profile?.name ?? authUser?.name}
        onContinueChat={(masterId, payload) => void handlePhotoContinueChat(masterId, payload)}
        onInsufficientRunes={(payload) => {
          setInsufficientRunes(payload);
          setShowRuneShop(true);
        }}
      />

      {showPaywall && session && (
        <Paywall
          sessionId={session.sessionId}
          userName={profile?.name}
          onClose={() => setShowPaywall(false)}
          onUnlocked={() => refresh(session.sessionId).then(() => setShowPaywall(false))}
        />
      )}

      <MasterDecksModal
        isOpen={showDecksModal}
        onClose={() => setShowDecksModal(false)}
        masters={masters}
        onBrowseDeck={handleBrowseDeck}
      />

      <RuneShopModal
        isOpen={showRuneShop}
        onClose={() => void handleRuneShopClose()}
        currentBalance={runeBalance}
        requiredRunes={insufficientRunes?.required}
      />
    </div>
  );
}
