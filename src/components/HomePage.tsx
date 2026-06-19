"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import Link from "next/link";

import OnboardingForm, { type OnboardingData } from "@/components/OnboardingForm";
import TarotTriplet from "@/components/TarotTriplet";
import MastersShowcase from "@/components/MastersShowcase";
import ChatWindow from "@/components/ChatWindow";
import Paywall from "@/components/Paywall";
import AuthHeader from "@/components/AuthHeader";
import RuneBalance, { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import RuneShopModal from "@/components/RuneShopModal";
import { type FlowStep } from "@/components/FlowStepper";
import LandingHero from "@/components/LandingHero";
import ReadingRecap from "@/components/ReadingRecap";
import DeckGallery from "@/components/DeckGallery";
import MasterDecksSection from "@/components/MasterDecksSection";
import LandingSections from "@/components/LandingSections";
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
import Skeleton from "@/components/Skeleton";
import { generateId } from "@/lib/id";
import { loadChatCache, saveChatCache, clearChatCache, mastersWithCachedReading, chatHasSpreadReading } from "@/lib/chat-cache";
import { mergeContinueMasterIds, latestTripletCreatedAt, primaryContinueMasterId, type StoredReadingRow } from "@/lib/reading-progress";
import {
  formatTripletCooldownRu,
  tripletCooldownFromLastDraw,
  type TripletCooldownStatus,
} from "@/lib/triplet-limit";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckSystem } from "@/lib/decks/types";
import { DEFAULT_DECK_SYSTEM, getDeckPositions, resolveMasterDeckSystem, spreadKey } from "@/lib/decks";
import { resolveSpreadSymbol } from "@/lib/symbol-visuals";
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

function profileApiPayload(profile: StoredProfile) {
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

function getSpreadForSystem(
  profile: StoredProfile | null | undefined,
  system: DeckSystem
): SpreadSymbol[] {
  const fromSpreads = profile?.deckSpreads?.[system];
  if (fromSpreads && fromSpreads.length >= 3) return fromSpreads;
  if (profile?.deckSystem === system && profile.tarotCards?.length >= 3) {
    return profile.tarotCards;
  }
  return [];
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
    tarotCards: data.keepSpread === false ? [] : cards,
    deckSystem: data.keepSpread === false ? undefined : deckSystem,
    teaser: data.keepSpread === false ? undefined : teaser,
  };
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

export default function HomePage({ referrerSlug }: HomePageProps) {
  const { config: runeConfig, cost: runeCost, formatRunes } = useRuneConfig();
  const { session, loading: sessionLoading, refresh, reconnectSession } = useAuraSession(referrerSlug);
  const { isLoggedIn, loading: authLoading, user: authUser } = useAuth();
  const [step, setStepState] = useState<FlowStep>("intro");
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [tripletSystem, setTripletSystem] = useState<DeckSystem>(DEFAULT_DECK_SYSTEM);
  const [masters, setMasters] = useState<ShowcaseMaster[]>(() => getAiMasters());
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [lastMasterId, setLastMasterId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [deckGalleryOpen, setDeckGalleryOpen] = useState(false);
  const [browseDeckMaster, setBrowseDeckMaster] = useState<ShowcaseMaster | null>(null);
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
    requestAnimationFrame(() => {
      document.getElementById("колода")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

        const latestTriplet = (data.readings as { characterName: string; contextData: Record<string, unknown> }[] | undefined)?.find(
          (r) => r.characterName === "triplet"
        );
        const cards = (latestTriplet?.contextData?.tarotCards as SpreadSymbol[] | undefined) ?? [];
        const deckSystemFromServer =
          (latestTriplet?.contextData?.deckSystem as DeckSystem | undefined) ??
          DEFAULT_DECK_SYSTEM;
        const teaserReading = (data.readings as { characterName: string; contextData: Record<string, unknown> }[] | undefined)?.find(
          (r) => r.contextData?.type === "reading"
        );
        const teaser =
          typeof latestTriplet?.contextData?.teaser === "string"
            ? latestTriplet.contextData.teaser
            : undefined;

        const restored: StoredProfile = {
          name: data.profile.name,
          gender: data.profile.gender,
          birthDate: data.profile.birthDate,
          zodiac: data.profile.zodiac,
          birthTime: data.profile.birthTime ?? undefined,
          birthCity: data.profile.birthCity ?? undefined,
          lifeFocus: data.profile.lifeFocus ?? undefined,
          mainQuestion: data.profile.mainQuestion ?? undefined,
          astroMeta: data.profile.astroMeta ?? undefined,
          userId: data.profileUserId,
          tarotCards: cards,
          deckSystem: deckSystemFromServer,
          teaser,
        };

        setProfile((prev) => {
          if (newTripletInProgressRef.current) {
            const next = {
              ...restored,
              tarotCards: prev?.tarotCards?.length ? prev.tarotCards : cards,
              teaser: prev?.teaser ?? teaser,
            };
            localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
            return next;
          }
          const nextCards = cards.length >= 3 ? cards : (prev?.tarotCards ?? cards);
          const next = { ...restored, tarotCards: nextCards, teaser: teaser ?? prev?.teaser };
          localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
          return next;
        });

        if (cards.length >= 3) {
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
        setSavedReadings(
          data.readings.map(
            (r: { characterName: string; createdAt?: string; contextData: Record<string, unknown> }) => ({
              characterName: r.characterName,
              createdAt: r.createdAt,
              contextData: r.contextData as StoredReadingRow["contextData"],
            })
          )
        );
        if (Array.isArray(data.continueMasterIds)) {
          setServerContinueIds(data.continueMasterIds);
        }

        setTripletCooldown(tripletCooldownFromProfileData(data));

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

    const fromProfile = profile?.tarotCards ?? [];
    const profileSystem = profile?.deckSystem ?? DEFAULT_DECK_SYSTEM;
    if (fromProfile.length >= 3) {
      return fromProfile.slice(0, 3).map((card) => resolveSpreadSymbol(profileSystem, card));
    }

    return fromProfile.map((card) => resolveSpreadSymbol(profileSystem, card));
  }, [profile?.tarotCards, profile?.deckSystem, savedReadings]);

  const tripletCountdown = useTripletCountdown(tripletCooldown?.nextAvailableAt);

  const tripletCooldownHint = useMemo(() => {
    if (tripletCountdown.isOnCooldown && tripletCountdown.hintRu) return tripletCountdown.hintRu;
    if (!tripletCooldown?.nextAvailableAt) return undefined;
    return `Новый расклад из 3 карт ${formatTripletCooldownRu(tripletCooldown.nextAvailableAt)}`;
  }, [tripletCountdown.isOnCooldown, tripletCountdown.hintRu, tripletCooldown?.nextAvailableAt, tripletCountdown.tick]);

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
        keepSpread: opts?.keepSpread,
      });
      if (newTripletInProgressRef.current) {
        setProfile((prev) => {
          const next = {
            ...restored,
            tarotCards: prev?.tarotCards?.length ? prev.tarotCards : restored.tarotCards,
            teaser: prev?.teaser ?? restored.teaser,
          };
          localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
          return next;
        });
      } else {
        persistProfile(restored);
        setProfile(restored);
      }
      return { data, cooldown, profile: restored };
    },
    []
  );

  const continueMasterIds = useMemo(() => {
    const cardsKey = spreadKey(displayTarotCards);
    const aiMasterIds = masters.map((m) => m.id);
    const merged = mergeContinueMasterIds(savedReadings, displayTarotCards, {
      cachedMasterIds: mastersWithCachedReading(cardsKey, aiMasterIds),
    });
    return [...new Set([...serverContinueIds, ...merged])];
  }, [savedReadings, displayTarotCards, serverContinueIds, masters]);

  const spreadReadingDone = continueMasterIds.length > 0;

  const recapContinueMasterId = useMemo(
    () =>
      primaryContinueMasterId(
        savedReadings,
        displayTarotCards,
        continueMasterIds,
        lastMasterId
      ),
    [savedReadings, displayTarotCards, continueMasterIds, lastMasterId]
  );

  const spreadCardsKey = useMemo(() => spreadKey(displayTarotCards), [displayTarotCards]);

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
        if (cid) saveChatCache(cid, updated, spreadCardsKey);
        return updated;
      });
    },
    [selectedCharacter, spreadCardsKey]
  );

  useEffect(() => {
    if (!selectedCharacter || !spreadCardsKey) return;

    const firstAssistant = messages.find((m) => m.role === "assistant");
    if (firstAssistant?.sceneImageUrl) {
      setChatHeaderImage((prev) => prev ?? firstAssistant.sceneImageUrl ?? null);
      return;
    }

    const savedUrl = resolveDestinyCardUrl(
      savedReadings,
      spreadCardsKey,
      selectedCharacter
    );
    if (savedUrl) {
      applyDestinyCardToChat(savedUrl, selectedCharacter);
    }
  }, [
    selectedCharacter,
    messages,
    savedReadings,
    spreadCardsKey,
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
        setTripletCooldown(tripletCooldownFromLastDraw(new Date()));
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

    const pendingMaster = localStorage.getItem(PENDING_MASTER_KEY);
    if (pendingMaster) {
      localStorage.removeItem(PENDING_MASTER_KEY);
      await bindSessionToMaster(pendingMaster);
      handleSelectCharacter(pendingMaster);
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
    if (!tripletCooldownReady || tripletCountdown.isOnCooldown) {
      const hint = tripletCooldown?.nextAvailableAt
        ? `Новый расклад из 3 карт ${formatTripletCooldownRu(tripletCooldown.nextAvailableAt)}`
        : "Новый расклад из 3 карт доступен один раз в сутки";
      setTripletNotice(hint);
      return;
    }
    const synced = await syncProfileFromServer({ keepSpread: true });
    const cooldown = synced?.cooldown ?? tripletCooldown;
    if (!cooldown?.allowed || (cooldown.nextAvailableAt && new Date(cooldown.nextAvailableAt).getTime() > Date.now())) {
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
    localStorage.removeItem(PENDING_MASTER_KEY);
    setLastMasterId(null);
    setSelectedCharacter(null);
    setMessages([]);
    setShowPaywall(false);
    setShowRuneShop(false);
    setInsufficientRunes(null);
    setChatHeaderImage(null);
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
        saveChatCache(characterId, updated, spreadCardsKey);
        return updated;
      });
    },
    [getActiveProfile, spreadCardsKey]
  );

  useEffect(() => {
    if (sessionOnlyChat) return;
    if (!selectedCharacter || !spreadCardsKey) return;

    const firstAssistant = messages.find((m) => m.role === "assistant");
    if (!firstAssistant || firstAssistant.sceneImageUrl) return;
    if (resolveDestinyCardUrl(savedReadings, spreadCardsKey, selectedCharacter)) return;
    if (!firstAssistant.content || firstAssistant.content.length < 40) return;

    const backfillKey = `${selectedCharacter}|${spreadCardsKey}`;
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
    spreadCardsKey,
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

        const cardsKey = spreadCardsKey || spreadKey(activeProfile.tarotCards);
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
          saveChatCache(characterId, [readingMsg], spreadCardsKey);
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
              ...profileApiPayload(activeProfile),
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
            saveChatCache(characterId, [readingMsg], spreadCardsKey);
            refreshSavedReadings();
            const savedUrl = resolveDestinyCardUrl(
              savedReadings,
              spreadCardsKey,
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
    [getActiveProfile, session?.offline, session?.sessionId, attachSceneToAssistantMessage, refreshSavedReadings, spreadCardsKey, runeCost, savedReadings, applyDestinyCardToChat]
  );

  const restoreChatForCharacter = useCallback(
    async (characterId: string): Promise<Message[] | null> => {
      const cached = loadChatCache(characterId, spreadCardsKey);
      if (cached?.length && chatHasSpreadReading(cached)) return cached;

      const activeProfile = getActiveProfile();
      const cardsKey = spreadCardsKey || spreadKey(activeProfile?.tarotCards);

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

        saveChatCache(characterId, restored, spreadCardsKey);
        return restored;
      } catch {
        return null;
      }
    },
    [getActiveProfile, session?.offline, session?.sessionId, spreadCardsKey]
  );

  useEffect(() => {
    if (!selectedCharacter || sessionLoading || authLoading || !isLoggedIn) return;
    if (messages.length > 0) return;
    if (readingInFlightRef.current) return;
    if (skipNextReadingRef.current) {
      skipNextReadingRef.current = false;
      return;
    }

    const cached = loadChatCache(selectedCharacter, spreadCardsKey);
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
    spreadCardsKey,
  ]);

  useEffect(() => {
    if (selectedCharacter && messages.length && chatHasSpreadReading(messages)) {
      saveChatCache(selectedCharacter, messages, spreadCardsKey);
    }
  }, [selectedCharacter, messages, spreadCardsKey]);

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
      setTripletSystem(system);
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
      saveChatCache(selectedCharacter, messages, spreadCardsKey);
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

  const recapMasterName = useMemo(() => {
    const id = recapContinueMasterId ?? recommendedId;
    if (!id) return undefined;
    return findShowcaseMaster(id, masters)?.name ?? getCharacterById(id)?.name;
  }, [recapContinueMasterId, recommendedId, masters]);

  const selectedMaster = selectedCharacter
    ? findShowcaseMaster(selectedCharacter, masters)
    : undefined;

  const showLanding = step === "intro";
  const inPersonalFlow = isLoggedIn && step !== "intro";

  if (sessionLoading || authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <p className="text-sm text-gray-500">Настраиваем канал...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <header className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <motion.div
            className="flex items-center gap-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Sparkles className="h-7 w-7 text-aura-purple" />
            <div>
              <span className="font-display text-2xl font-bold tracking-wider text-white neon-text">
                Aura
              </span>
              <span className="ml-2 hidden text-xs text-gray-600 sm:inline">эзотерический оракул</span>
            </div>
          </motion.div>

          <nav className="hidden items-center gap-8 md:flex">
            {[
              { label: photoNavLabel, action: openPhotoReading },
              { label: "Мастера", id: "наставники" },
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

          <div className="flex items-center gap-3">
            {isLoggedIn && (
              <RuneBalance onBuyClick={() => setShowRuneShop(true)} />
            )}
            <AuthHeader />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8 md:py-12">
        {selectedCharacter && !isLoggedIn ? (
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
            spreadCards={sessionOnlyChat ? undefined : displayTarotCards}
            spreadDeckSystem={
              selectedMaster?.system ?? profile?.deckSystem ?? DEFAULT_DECK_SYSTEM
            }
            onSendMessage={handleSendMessage}
            onClose={handleCloseChat}
            sessionOffline={Boolean(session?.offline)}
            onReconnectSession={reconnecting ? undefined : () => void handleReconnectSession()}
            onOpenPaywall={() => setShowPaywall(true)}
          />
        ) : inPersonalFlow ? (
          <div className="mx-auto max-w-4xl">

            {step === "onboarding" && (
              <section className="mb-12">
                <OnboardingForm
                  initialName={authUser?.name ?? profile?.name}
                  onComplete={handleOnboardingComplete}
                />
              </section>
            )}

            {step === "triplet" && profile && (
              <section className="flow-panel mb-12">
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
                      onClick={() => {
                        newTripletInProgressRef.current = false;
                        setNewTripletDraft(false);
                        setStep("masters");
                      }}
                      className="btn-neon px-6 py-2.5 text-sm"
                    >
                      К мастерам и текущему раскладу
                    </button>
                  </div>
                ) : (
                  <>
                    <TarotTriplet
                      key={newTripletDraft ? `new-triplet-${tripletSystem}` : `triplet-${tripletSystem}`}
                      userName={profile.name}
                      zodiac={profile.zodiac}
                      system={tripletSystem}
                      masterName={recapMasterName}
                      initialCards={
                        newTripletDraft
                          ? undefined
                          : getSpreadForSystem(profile, tripletSystem).length >= 3
                            ? getSpreadForSystem(profile, tripletSystem)
                            : displayTarotCards
                      }
                      onComplete={handleTripletComplete}
                    />
                    {newTripletDraft && displayTarotCards.length >= 3 ? (
                      <div className="mt-6 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            newTripletInProgressRef.current = false;
                            setNewTripletDraft(false);
                            setStep("masters");
                          }}
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

            {step === "masters" && profile && (
              <>
                {showWelcomeBack && recapContinueMasterId ? (
                  <WelcomeBackBanner
                    userName={profile.name}
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
                  userName={profile.name}
                  birthDate={profile.birthDate}
                  tarotCards={displayTarotCards}
                  deckSystem={profile.deckSystem ?? tripletSystem}
                  teaser={profile.teaser}
                  lastMasterId={recapContinueMasterId}
                  masters={masters}
                  onContinue={
                    recapContinueMasterId
                      ? () => void handleMasterPick(recapContinueMasterId)
                      : undefined
                  }
                  onNewReading={handleNewReading}
                  cooldownReady={tripletCooldownReady}
                  nextAvailableAt={tripletCooldown?.nextAvailableAt}
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
                      setBrowseDeckMaster(null);
                      document.getElementById("мой-расклад")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    backLabel={browseDeckMaster ? "К витрине мастеров" : "К моему раскладу"}
                  />
                )}

                <MastersShowcase
                  className="mt-2"
                  masters={masters}
                  onSelect={(id) => void handleMasterPick(id)}
                  onBrowseDeck={handleBrowseDeck}
                  recommendedId={recommendedId}
                  continueMasterIds={continueMasterIds}
                  spreadReadingDone={spreadReadingDone}
                  runesEnabled={runeConfig.enabled}
                  readingCost={runeConfig.enabled ? runeCost("READING") : undefined}
                  questionCost={runeConfig.enabled ? runeCost("QUESTION") : undefined}
                  formatRunes={formatRunes}
                  title="Выберите мастера"
                  subtitle={
                    spreadReadingDone
                      ? "Расшифровка расклада уже есть — продолжите с тем же мастером или начните свободный сеанс с другим"
                      : "Карты уже выпали — выберите, кто их расшифрует"
                  }
                />

                <LandingSections
                  hasSession={Boolean(session?.sessionId)}
                  isLoggedIn={isLoggedIn}
                  onStartFlow={() => void startPersonalFlow()}
                  onOpenPaywall={() => setShowPaywall(true)}
                  onOpenRuneShop={() => setShowRuneShop(true)}
                />
              </>
            )}
          </div>
        ) : (
          <>
            {showLanding && (
              <LandingHero
                isLoggedIn={isLoggedIn}
                masterCount={masters.length || undefined}
                onStart={() => void startPersonalFlow()}
              />
            )}
          </>
        )}

        {!selectedCharacter && !inPersonalFlow && showLanding && (
          <>
            <MastersShowcase
              masters={masters}
              onSelect={(id) => void handleMasterPick(id)}
              onBrowseDeck={handleBrowseDeck}
              recommendedId={recommendedId}
              continueMasterIds={continueMasterIds}
              runesEnabled={runeConfig.enabled}
              readingCost={runeConfig.enabled ? runeCost("READING") : undefined}
              questionCost={runeConfig.enabled ? runeCost("QUESTION") : undefined}
              formatRunes={formatRunes}
              title="Витрина мастеров Aura"
              subtitle="AI-наставники платформы и живые эксперты с авторским стилем"
            />

            <MasterDecksSection masters={masters} onBrowseDeck={handleBrowseDeck} />

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
                  document.getElementById("колоды")?.scrollIntoView({ behavior: "smooth" });
                }}
                backLabel="К колодам мастеров"
              />
            )}

            <LandingSections
              hasSession={Boolean(session?.sessionId)}
              isLoggedIn={isLoggedIn}
              onStartFlow={() => void startPersonalFlow()}
              onOpenPaywall={() => setShowPaywall(true)}
              onOpenRuneShop={() => setShowRuneShop(true)}
            />
          </>
        )}
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

      <RuneShopModal
        isOpen={showRuneShop}
        onClose={() => void handleRuneShopClose()}
        currentBalance={runeBalance}
        requiredRunes={insufficientRunes?.required}
      />
    </div>
  );
}
