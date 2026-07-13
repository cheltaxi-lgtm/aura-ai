"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { getDeckPositions, resolveMasterDeckSystem } from "@/lib/decks";
import type { SpreadSymbol } from "@/lib/decks/types";
import {
  buildSeededTableDeck,
  resolvePickedSpread,
  resolveTableSize,
} from "@/lib/spread-draw";
import { buildGuestSpreadSeed } from "@/lib/spread-seed";
import { getSpreadRitualCopy } from "@/lib/spread-ritual-copy";
import { saveGuestTriplet } from "@/lib/guest-triplet";
import { buildGuestTripletPreview, buildGuestTripletTeaser } from "@/lib/guest-triplet-teaser";
import { confirmAgeGateOnServer, isAgeGateConfirmed } from "@/lib/age-gate";
import {
  GUEST_SPREAD_SECTION_ID,
  GUEST_SPREAD_START_EVENT,
  LANDING_QUESTION_KEY,
  type GuestSpreadStartDetail,
} from "@/lib/landing-offer";
import {
  buildRegisterHref,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";
import {
  trackGuestCardRevealed,
  trackGuestSpreadCompleted,
  trackGuestSpreadStarted,
  trackRegistrationCtaClick,
  trackRegistrationGateView,
} from "@/lib/seo/metrika";
import { getCharacterById } from "@/lib/characters";
import DeckCard from "@/components/DeckCard";
import MagicalSpreadTable from "@/components/MagicalSpreadTable";
import ShareButton from "@/components/share/ShareButton";
import { tripletToSharePayload } from "@/lib/share/payload-builders";

const GUEST_ID_KEY = "zovus_guest_id";
const GUEST_SPREAD_DRAFT_KEY = "zovus_guest_spread_draft";
const CARD_COUNT = 3;

function getGuestId(): string {
  if (typeof window === "undefined") return "guest";
  let id = localStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `g-${Date.now()}`;
    localStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

type GuestStep = "idle" | "intro" | "pick" | "flip" | "done";

type GuestSpreadDraft = {
  step: GuestStep;
  masterId: string;
  sessionSeed: string;
  pickedIndices: number[];
  deck: SpreadSymbol[];
  revealed: boolean[];
  landingQuestion: string;
};

type GuestTripletDrawProps = {
  className?: string;
};

function readGuestSpreadDraft(): GuestSpreadDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GUEST_SPREAD_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestSpreadDraft;
    if (!parsed?.step || parsed.step === "idle" || parsed.step === "done") return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function GuestTripletDraw({ className = "" }: GuestTripletDrawProps) {
  const [masterId, setMasterId] = useState("veronika");
  const system = resolveMasterDeckSystem(masterId);
  const positions = getDeckPositions(system);
  const tableSize = resolveTableSize(system, true);
  const [step, setStep] = useState<GuestStep>("idle");
  const [sessionSeed, setSessionSeed] = useState("");
  const [deck, setDeck] = useState<SpreadSymbol[]>([]);
  const [pickedIndices, setPickedIndices] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([false, false, false]);
  const [ageConfirming, setAgeConfirming] = useState(false);
  const [ageGateError, setAgeGateError] = useState("");
  const [landingQuestion, setLandingQuestion] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [explicitMasterPick, setExplicitMasterPick] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const ritualCopy = useMemo(
    () => getSpreadRitualCopy(masterId, { hasBirthDate: false, cardCount: CARD_COUNT }),
    [masterId]
  );

  const previewText = useMemo(() => {
    if (deck.length < CARD_COUNT) return "";
    return buildGuestTripletPreview(deck, positions);
  }, [deck, positions]);

  useEffect(() => {
    if (typeof window === "undefined" || draftRestored) return;
    const stored = sessionStorage.getItem(LANDING_QUESTION_KEY);
    if (stored) setLandingQuestion(stored);
    setAgeConfirmed(isAgeGateConfirmed());

    const draft = readGuestSpreadDraft();
    if (draft) {
      setMasterId(draft.masterId);
      setStep(draft.step);
      setSessionSeed(draft.sessionSeed);
      setPickedIndices(draft.pickedIndices);
      setDeck(draft.deck);
      setRevealed(draft.revealed);
      setLandingQuestion(draft.landingQuestion);
    }
    setDraftRestored(true);
  }, [draftRestored]);

  useEffect(() => {
    if (typeof window === "undefined" || step === "idle" || step === "done") return;
    const draft: GuestSpreadDraft = {
      step,
      masterId,
      sessionSeed,
      pickedIndices,
      deck,
      revealed,
      landingQuestion,
    };
    sessionStorage.setItem(GUEST_SPREAD_DRAFT_KEY, JSON.stringify(draft));
  }, [step, masterId, sessionSeed, pickedIndices, deck, revealed, landingQuestion]);

  const resetSpreadState = useCallback(() => {
    setSessionSeed("");
    setPickedIndices([]);
    setDeck([]);
    setRevealed([false, false, false]);
    sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY);
  }, []);

  const resetPickProgress = useCallback(() => {
    setPickedIndices([]);
    setDeck([]);
    setRevealed([false, false, false]);
  }, []);

  const ensureSessionSeed = useCallback(() => {
    if (sessionSeed) return sessionSeed;
    const seed = buildGuestSpreadSeed({
      guestId: getGuestId(),
      masterId,
      spreadId: "triplet",
      topic: "guest_preview",
    });
    setSessionSeed(seed);
    return seed;
  }, [masterId, sessionSeed]);

  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<GuestSpreadStartDetail>).detail;
      const nextQuestion = detail?.question?.trim();
      const nextMasterId = detail?.masterId || "veronika";
      setMasterId(nextMasterId);
      setExplicitMasterPick(Boolean(detail?.masterId));
      resetSpreadState();
      setAgeGateError("");
      if (nextQuestion) {
        sessionStorage.setItem(LANDING_QUESTION_KEY, nextQuestion);
        setLandingQuestion(nextQuestion);
      }
      const seed = buildGuestSpreadSeed({
        guestId: getGuestId(),
        masterId: nextMasterId,
        spreadId: "triplet",
        topic: "guest_preview",
      });
      setSessionSeed(seed);
      trackGuestSpreadStarted();
      setStep("intro");
      window.requestAnimationFrame(() => {
        document.getElementById("guest-spread")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    window.addEventListener(GUEST_SPREAD_START_EVENT, onStart);
    return () => window.removeEventListener(GUEST_SPREAD_START_EVENT, onStart);
  }, [resetSpreadState]);

  useEffect(() => {
    if (step !== "intro" || sessionSeed) return;
    setSessionSeed(
      buildGuestSpreadSeed({
        guestId: getGuestId(),
        masterId,
        spreadId: "triplet",
        topic: "guest_preview",
      })
    );
  }, [step, sessionSeed, masterId]);

  const beginPick = useCallback(() => {
    ensureSessionSeed();
    resetPickProgress();
    setStep("pick");
  }, [ensureSessionSeed, resetPickProgress]);

  const handleIntroContinue = async () => {
    setAgeGateError("");
    if (!ageConfirmed) {
      setAgeConfirming(true);
      const ok = await confirmAgeGateOnServer();
      setAgeConfirming(false);
      if (!ok) {
        setAgeGateError("Не удалось подтвердить возраст. Обновите страницу и попробуйте ещё раз.");
        return;
      }
      setAgeConfirmed(true);
    }
    beginPick();
  };

  const resolveGuestPicks = useCallback(
    (indices: number[], seed: string) => {
      if (!seed) return;
      const table = buildSeededTableDeck({ system, seed, tableSize });
      const cards = resolvePickedSpread(table, indices);
      if (cards.length < CARD_COUNT) return;
      setDeck(cards);
      setStep("flip");
      window.requestAnimationFrame(() => {
        document.getElementById("guest-spread-flip")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [system, tableSize]
  );

  const handleTablePick = useCallback(
    (index: number) => {
      if (pickedIndices.includes(index)) return;
      const next = [...pickedIndices, index];
      setPickedIndices(next);
      if (next.length >= CARD_COUNT) {
        const seed = ensureSessionSeed();
        resolveGuestPicks(next, seed);
      }
    },
    [pickedIndices, resolveGuestPicks, ensureSessionSeed]
  );

  const handleFlip = (index: number) => {
    if (revealed[index] || !deck[index]?.name) return;
    trackGuestCardRevealed(index + 1);
    setRevealed((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  };

  const allRevealed = revealed.every(Boolean);

  const goToRegistration = useCallback(() => {
    trackRegistrationCtaClick("guest_triplet_register");
    sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY);
    window.location.assign(
      buildRegisterHref(
        resolveRegistrationReturnTo({
          guestSpread: true,
          guestMasterId: masterId,
          guestQuestion: landingQuestion || undefined,
        })
      )
    );
  }, [masterId, landingQuestion]);

  const handleFinish = () => {
    if (deck.length < CARD_COUNT || !allRevealed) return;
    const teaser = buildGuestTripletTeaser(deck);
    saveGuestTriplet({
      tarotCards: deck,
      deckSystem: system,
      teaser,
      completedAt: new Date().toISOString(),
      question: landingQuestion || undefined,
      masterId,
    });
    trackGuestSpreadCompleted();
    trackRegistrationGateView("guest_triplet_done");
    setStep("done");
    sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY);
    window.requestAnimationFrame(() => {
      document.getElementById("guest-spread")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const sharePayload = useMemo(() => {
    if (step !== "done" || deck.length < CARD_COUNT) return null;
    return tripletToSharePayload({
      userName: "Гость",
      cards: deck,
      deckSystem: system,
      teaser: buildGuestTripletTeaser(deck),
    });
  }, [step, deck, system]);

  if (step === "idle") {
    return (
      <div
        id={GUEST_SPREAD_SECTION_ID}
        className={`mx-auto max-w-lg px-4 py-10 text-center text-sm leading-relaxed text-aura-ivory/50 ${className}`.trim()}
      >
        Нажмите «Открыть 3 карты бесплатно» выше — здесь появится ваш бесплатный расклад из трёх карт.
      </div>
    );
  }

  const pickedMasterName = getCharacterById(masterId)?.name;

  if (step === "intro") {
    return (
      <div className={`mx-auto max-w-md px-4 ${className}`.trim()}>
        <div className="glass-panel space-y-5 p-8 text-center">
          <p className="lux-label">Бесплатный расклад · 3 карты</p>
          {explicitMasterPick && pickedMasterName ? (
            <p className="text-sm text-aura-champagne/85">
              Мастер {pickedMasterName} проведёт ваш бесплатный расклад — откройте три карты, затем зарегистрируйтесь
              для полной расшифровки.
            </p>
          ) : null}
          {landingQuestion ? (
            <p className="text-sm text-aura-champagne/80">Ваш вопрос: «{landingQuestion}»</p>
          ) : null}
          <h2 className="font-display text-xl font-semibold text-[#EDE6DA]">{ritualCopy.title}</h2>
          <p className="text-sm leading-relaxed text-aura-ivory/75">{ritualCopy.body}</p>
          <p className="text-xs uppercase tracking-widest text-aura-gold/80">{ritualCopy.personalNote}</p>
          {!ageConfirmed ? (
            <p className="text-sm leading-relaxed text-aura-ivory/65">
              Бесплатный расклад доступен пользователям от 18 лет. Сервис носит развлекательно-ознакомительный
              характер.
            </p>
          ) : null}
          {ageGateError ? <p className="text-sm text-red-400">{ageGateError}</p> : null}
          <button
            type="button"
            onClick={() => void handleIntroContinue()}
            disabled={ageConfirming}
            className="btn-primary w-full px-8 py-3.5 disabled:opacity-50"
          >
            {ageConfirming
              ? "Подтверждаем…"
              : ageConfirmed
                ? "К столу карт"
                : "Мне есть 18 лет — к столу карт"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "pick") {
    return (
      <MagicalSpreadTable
        tableSize={tableSize}
        cardCount={CARD_COUNT}
        system={system}
        masterId={masterId}
        pickedIndices={pickedIndices}
        onPick={handleTablePick}
        pickHint={ritualCopy.pickHint}
        personalNote={ritualCopy.personalNote}
        title="Выберите три карты"
        standalone
        onBack={() => {
          setPickedIndices([]);
          setStep("intro");
        }}
      />
    );
  }

  if (step === "done") {
    return (
      <motion.div
        id="guest-spread"
        className={`glass-panel mx-auto max-w-lg space-y-5 p-8 ${className}`.trim()}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <p className="text-center text-sm font-medium text-aura-champagne/85">Краткий ориентир по вашему раскладу</p>
        <div className="guest-spread-preview rounded-xl border border-aura-gold/20 bg-black/25 p-4 text-left text-sm leading-relaxed text-aura-ivory/80 whitespace-pre-line">
          {previewText}
        </div>
        <p className="text-center text-sm leading-relaxed text-aura-ivory/65">
          Зарегистрируйтесь — мастер даст полную связную расшифровку, и вы сможете задать первые вопросы
          бесплатно.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={goToRegistration}
            className="btn-luxe btn-luxe--md btn-luxe--gold inline-block px-10 py-3.5 text-center"
          >
            Получить полную расшифровку
          </button>
          {sharePayload ? (
            <ShareButton payload={sharePayload} variant="pill" label="Поделиться раскладом" />
          ) : null}
        </div>
      </motion.div>
    );
  }

  return (
    <div id="guest-spread-flip" className={`mx-auto mb-12 max-w-3xl px-4 ${className}`.trim()}>
      <p className="lux-label mb-2 text-center">{ritualCopy.personalNote}</p>
      <p className="mb-2 text-center text-sm text-aura-ivory/60">{ritualCopy.drawHint}</p>
      <p className="mb-8 text-center text-sm font-medium text-aura-champagne/80">
        {allRevealed ? "Расклад открыт — сохраните результат" : "Нажмите на каждую карту, чтобы открыть"}
      </p>

      <div className="mb-10 flex flex-wrap items-end justify-center gap-5 sm:gap-8">
        {positions.map((pos, i) => (
          <div key={pos} className="flex max-w-[148px] flex-col items-center gap-2">
            <p className="lux-label text-center">{pos}</p>
            <button
              type="button"
              onClick={() => handleFlip(i)}
              disabled={revealed[i] || !deck[i]?.name}
              className="perspective-1000 h-[220px] w-[140px] sm:h-[236px] sm:w-[148px]"
              aria-label={revealed[i] ? deck[i]?.name ?? pos : `Открыть ${pos}`}
            >
              <motion.div
                className="relative h-full w-full preserve-3d"
                animate={{ rotateY: revealed[i] ? 180 : 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="absolute inset-0 backface-hidden">
                  <DeckCard
                    card={{ name: deck[i]?.name ?? pos, meaning: deck[i]?.meaning ?? "" }}
                    system={system}
                    faceDown
                    showMeaning={false}
                    size="md"
                    className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none"
                  />
                </div>
                <div className="absolute inset-0 backface-hidden rotate-y-180">
                  <DeckCard
                    card={{ name: deck[i]?.name ?? pos, meaning: deck[i]?.meaning ?? "" }}
                    system={system}
                    showMeaning={false}
                    size="md"
                    className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none"
                  />
                </div>
              </motion.div>
            </button>
            {revealed[i] && deck[i]?.meaning ? (
              <p className="guest-spread-card-meaning text-center text-[10px] leading-snug text-aura-ivory/55">
                {deck[i].meaning}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={handleFinish}
          disabled={!allRevealed}
          className="btn-primary px-10 py-3.5 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {allRevealed
            ? "Сохранить расклад и продолжить"
            : `Откройте все карты (${revealed.filter(Boolean).length}/${CARD_COUNT})`}
        </button>
      </div>
    </div>
  );
}
