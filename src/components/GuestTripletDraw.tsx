"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { getDeckPositionsForUi, resolveMasterDeckSystem } from "@/lib/decks";
import type { SpreadSymbol } from "@/lib/decks/types";
import {
  buildSeededTableDeck,
  resolvePickedSpread,
  resolveTableSize,
} from "@/lib/spread-draw";
import { buildGuestSpreadSeed } from "@/lib/spread-seed";
import { getSpreadRitualCopy } from "@/lib/spread-ritual-copy";
import { saveGuestTriplet } from "@/lib/guest-triplet";
import { hasActiveGuestResumeIntent, loadGuestResumeUiCache, saveGuestResumeUiCache, type GuestResumeUiCache } from "@/lib/guest-resume-ui-cache";
import {
  buildGuestNarrativeFallback,
  buildGuestTripletTeaser,
} from "@/lib/guest-triplet-teaser";
import { GUEST_RESUME_SPREAD_ID } from "@/lib/guest-triplet-receipt-shared";
import {
  confirmAgeGateOnServer,
  fetchServerAgeGateConfirmed,
} from "@/lib/age-gate";
import {
  clearPendingGuestSpreadStart,
  GUEST_SPREAD_DRAFT_KEY,
  GUEST_SPREAD_PICKER_ID,
  GUEST_SPREAD_RESET_EVENT,
  GUEST_SPREAD_START_EVENT,
  GUEST_TRIPLET_MASTER_ID,
  LANDING_QUESTION_KEY,
  peekPendingGuestSpreadStart,
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
  trackAuthEmailView,
  trackAuthGateView,
  trackGuestTeaserCta,
  trackGuestTeaserView,
  trackGuestIntroBlockedAuthenticated,
} from "@/lib/seo/metrika";
import DeckCard from "@/components/DeckCard";
import MagicalSpreadTable from "@/components/MagicalSpreadTable";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import OAuthConsentFields from "@/components/auth/OAuthConsentFields";
import StarterRunesValue from "@/components/auth/StarterRunesValue";

const GUEST_ID_KEY = "zovus_guest_id";
const CARD_COUNT = 3;
const GUEST_TEASER_AUTH_ID = "guest-teaser-auth";
/** Match server TEASER_RECEIPT_MIN_AGE_MS before first teaser fetch. */
const TEASER_FETCH_MIN_DELAY_MS = 800;
/** If the teaser LLM hangs, show keyword copy so conversion is not blocked. */
const TEASER_FALLBACK_MS = 8_000;

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

type GuestStep = "idle" | "age" | "intro" | "pick" | "flip" | "done";

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
  startRequest?: {
    id: number;
    detail: GuestSpreadStartDetail;
  } | null;
};

function GuestSpreadSection({ children }: { children: React.ReactNode }) {
  return (
    <section
      id={GUEST_SPREAD_PICKER_ID}
      className="aura-landing-section aura-landing-section--guest-spread"
      style={{ paddingTop: "calc(var(--app-header-h, 3.25rem) + 1rem)" }}
      tabIndex={-1}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export default function GuestTripletDraw({
  className = "",
  startRequest = null,
}: GuestTripletDrawProps) {
  const masterId = GUEST_TRIPLET_MASTER_ID;
  const system = resolveMasterDeckSystem(masterId);
  const positions = getDeckPositionsForUi(system);
  const tableSize = resolveTableSize(system, true);
  const [step, setStep] = useState<GuestStep>("idle");
  const [sessionSeed, setSessionSeed] = useState("");
  const [deck, setDeck] = useState<SpreadSymbol[]>([]);
  const [pickedIndices, setPickedIndices] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([false, false, false]);
  const [ageConfirming, setAgeConfirming] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [ageGateError, setAgeGateError] = useState("");
  const [landingQuestion, setLandingQuestion] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [oauthAgeConfirmed, setOauthAgeConfirmed] = useState(false);
  const [ageConfirmedLocked, setAgeConfirmedLocked] = useState(false);
  const handledStartRequestId = useRef<number | null>(null);
  const ageFlowVersionRef = useRef(0);
  const ageRequestRef = useRef<AbortController | null>(null);
  const teaserViewTracked = useRef(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [savedResume, setSavedResume] = useState<GuestResumeUiCache | null>(null);
  const [teaserText, setTeaserText] = useState("");
  const [teaserLoading, setTeaserLoading] = useState(false);
  const [teaserPaused, setTeaserPaused] = useState(false);
  /** Auth gate only after explicit conversion CTA — not immediately after teaser. */
  const [showAuthGate, setShowAuthGate] = useState(false);
  const receiptReadyAtRef = useRef<number | null>(null);
  const teaserFetchedRef = useRef(false);
  const teaserBlockRef = useRef<HTMLDivElement | null>(null);
  const authGateViewTracked = useRef(false);

  useEffect(() => () => {
    ageFlowVersionRef.current++;
    ageRequestRef.current?.abort();
  }, []);

  const oauthReturnTo = useMemo(
    () =>
      resolveRegistrationReturnTo({
        guestSpread: true,
        guestMasterId: masterId,
        guestQuestion: landingQuestion || undefined,
      }),
    [masterId, landingQuestion]
  );

  const ritualCopy = useMemo(
    () => getSpreadRitualCopy(masterId, { hasBirthDate: false, cardCount: CARD_COUNT }),
    [masterId]
  );

  const keywordFallback = useMemo(() => {
    if (deck.length < CARD_COUNT) return "";
    return buildGuestNarrativeFallback(
      landingQuestion,
      deck.map((c) => ({ name: c.name, meaning: c.meaning }))
    );
  }, [deck, landingQuestion]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (step === "idle") {
      delete document.documentElement.dataset.guestSpreadActive;
    } else {
      document.documentElement.dataset.guestSpreadActive = "1";
    }
    return () => {
      delete document.documentElement.dataset.guestSpreadActive;
    };
  }, [step]);

  useEffect(() => {
    if (step !== "done") {
      teaserFetchedRef.current = false;
      setTeaserText("");
      setTeaserLoading(false);
      return;
    }

    // Reserve teaser slot immediately — never flash keyword meanings while waiting.
    setTeaserLoading(true);
    setTeaserText("");

    let cancelled = false;
    let timer: number | null = null;
    const fallbackTimer = window.setTimeout(() => {
      if (cancelled) return;
      setTeaserText(
        (prev) =>
          prev ||
          keywordFallback ||
          "Карты уже сохранены. Полный разбор откроется после входа — пересчёта не будет."
      );
      setTeaserLoading(false);
    }, TEASER_FALLBACK_MS);

    const run = async () => {
      const readyAt = receiptReadyAtRef.current ?? Date.now();
      const wait = Math.max(0, TEASER_FETCH_MIN_DELAY_MS - (Date.now() - readyAt));
      await new Promise<void>((resolve) => {
        timer = window.setTimeout(() => resolve(), wait);
      });
      if (cancelled || teaserFetchedRef.current) return;
      teaserFetchedRef.current = true;
      try {
        const res = await fetch("/api/guest-triplet/teaser", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          if (!cancelled) setTeaserText(keywordFallback);
          return;
        }
        const data = (await res.json()) as {
          text?: string;
          isFallback?: boolean;
        };
        if (cancelled) return;
        const text = typeof data.text === "string" ? data.text.trim() : "";
        setTeaserText(text || keywordFallback);
      } catch {
        if (!cancelled) setTeaserText(keywordFallback);
      } finally {
        if (!cancelled) setTeaserLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [step, keywordFallback]);

  useEffect(() => {
    if (step !== "done") return;

    const onVisibility = () => {
      setTeaserPaused(document.visibilityState === "hidden");
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);

    const node = teaserBlockRef.current;
    let io: IntersectionObserver | null = null;
    if (node && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          setTeaserPaused((prev) => {
            const hiddenPage = document.visibilityState === "hidden";
            return hiddenPage || !entry.isIntersecting;
          });
        },
        { threshold: 0.15 }
      );
      io.observe(node);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, [step]);

  useEffect(() => {
    if (typeof window === "undefined" || draftRestored) return;
    const stored = sessionStorage.getItem(LANDING_QUESTION_KEY);
    if (stored) setLandingQuestion(stored);
    const controller = new AbortController();
    ageRequestRef.current = controller;
    const version = ageFlowVersionRef.current;
    void fetchServerAgeGateConfirmed(controller.signal).then((ok) => {
      if (controller.signal.aborted || version !== ageFlowVersionRef.current) return;
      setAgeConfirmed(ok);
      setOauthAgeConfirmed(ok);
    });

    // Never auto-restore an in-progress guest draw or pending-auth teaser on homepage
    // load — a stuck draft previously hijacked the whole landing.
    try { sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY); } catch { /* optional draft */ }
    setSavedResume(hasActiveGuestResumeIntent() ? loadGuestResumeUiCache() : null);
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
    try { sessionStorage.setItem(GUEST_SPREAD_DRAFT_KEY, JSON.stringify(draft)); } catch { /* optional draft */ }
  }, [step, masterId, sessionSeed, pickedIndices, deck, revealed, landingQuestion]);

  useEffect(() => {
    if (step !== "done" || teaserLoading || !teaserText.trim() || teaserViewTracked.current) return;
    const node = teaserBlockRef.current;
    if (!node) return;
    const trackVisible = () => {
      const rect = node.getBoundingClientRect();
      if (document.visibilityState !== "visible" || rect.bottom <= 0 || rect.top >= window.innerHeight || teaserViewTracked.current) return;
      teaserViewTracked.current = true;
      trackGuestTeaserView();
    };
    const observer = new IntersectionObserver(trackVisible, { threshold: 0.15 });
    observer.observe(node);
    document.addEventListener("visibilitychange", trackVisible);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", trackVisible);
    };
  }, [step, teaserLoading, teaserText]);

  useEffect(() => {
    if (!showAuthGate || authGateViewTracked.current) return;
    authGateViewTracked.current = true;
    trackAuthGateView("guest_teaser");
  }, [showAuthGate]);

  useEffect(() => {
    if (!showAuthGate) return;
    void fetchServerAgeGateConfirmed().then((ok) => {
      if (!ok) {
        setOauthAgeConfirmed(false);
        setAgeConfirmedLocked(false);
        return;
      }
      setOauthAgeConfirmed(true);
      setAgeConfirmedLocked(true);
    });
  }, [showAuthGate]);

  const resetSpreadState = useCallback(() => {
    setSessionSeed("");
    setPickedIndices([]);
    setDeck([]);
    setRevealed([false, false, false]);
    setCompleting(false);
    setAgeGateError("");
    setTeaserText("");
    setTeaserLoading(false);
    setShowAuthGate(false);
    receiptReadyAtRef.current = null;
    teaserFetchedRef.current = false;
    authGateViewTracked.current = false;
    sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY);
  }, []);

  const exitToLanding = useCallback(() => {
    ageFlowVersionRef.current++;
    ageRequestRef.current?.abort();
    setAgeConfirming(false);
    // UI only — receipt / guest resume UI cache stays for post-auth claim.
    clearPendingGuestSpreadStart();
    resetSpreadState();
    setSavedResume(hasActiveGuestResumeIntent() ? loadGuestResumeUiCache() : null);
    setStep("idle");
    teaserViewTracked.current = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [resetSpreadState]);

  const openFullReadingGate = useCallback(() => {
    trackGuestTeaserCta();
    setShowAuthGate(true);
    window.requestAnimationFrame(() => {
      document.getElementById(GUEST_TEASER_AUTH_ID)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
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

  const openCardPicker = useCallback(() => {
    ensureSessionSeed();
    resetPickProgress();
    setStep("pick");
  }, [ensureSessionSeed, resetPickProgress]);

  const beginGuestSpread = useCallback(
    (question?: string) => {
      resetSpreadState();
      teaserViewTracked.current = false;
      setAgeGateError("");
      if (question) {
        sessionStorage.setItem(LANDING_QUESTION_KEY, question);
        setLandingQuestion(question);
      }
      const seed = buildGuestSpreadSeed({
        guestId: getGuestId(),
        masterId: GUEST_TRIPLET_MASTER_ID,
        spreadId: "triplet",
        topic: "guest_preview",
      });
      setSessionSeed(seed);
      trackGuestSpreadStarted();
      openCardPicker();
    },
    [resetSpreadState, openCardPicker]
  );

  const confirmAgeAndStart = useCallback(async () => {
    const version = ++ageFlowVersionRef.current;
    ageRequestRef.current?.abort();
    setAgeConfirming(true);
    setAgeGateError("");
    const ok = await confirmAgeGateOnServer();
    if (version !== ageFlowVersionRef.current) return;
    setAgeConfirming(false);
    if (!ok) {
      setAgeGateError("Не удалось подтвердить возраст. Обновите страницу и попробуйте ещё раз.");
      return;
    }
    setAgeConfirmed(true);
    setOauthAgeConfirmed(true);
    const pendingQuestion =
      typeof window !== "undefined"
        ? sessionStorage.getItem(LANDING_QUESTION_KEY) || landingQuestion
        : landingQuestion;
    beginGuestSpread(pendingQuestion || undefined);
  }, [beginGuestSpread, landingQuestion]);

  const handleStartRequest = useCallback(
    (detail?: GuestSpreadStartDetail) => {
      const version = ++ageFlowVersionRef.current;
      ageRequestRef.current?.abort();
      const controller = new AbortController();
      ageRequestRef.current = controller;
      // Give the click an immediate visible response. Only the server response
      // or a successful confirmation below may advance to card selection.
      setAgeGateError("");
      setAgeConfirming(false);
      setStep("age");
      const nextQuestion = detail?.question?.trim();
      if (nextQuestion) {
        sessionStorage.setItem(LANDING_QUESTION_KEY, nextQuestion);
        setLandingQuestion(nextQuestion);
      }
      void fetchServerAgeGateConfirmed(controller.signal).then((ok) => {
        if (controller.signal.aborted || version !== ageFlowVersionRef.current) return;
        if (!ok) {
          setAgeConfirmed(false);
          setOauthAgeConfirmed(false);
          setAgeGateError("");
          setStep("age");
          return;
        }
        setAgeConfirmed(true);
        setOauthAgeConfirmed(true);
        beginGuestSpread(nextQuestion);
      });
    },
    [beginGuestSpread]
  );

  useEffect(() => {
    const onStart = (event: Event) => {
      handleStartRequest((event as CustomEvent<GuestSpreadStartDetail>).detail);
    };
    window.addEventListener(GUEST_SPREAD_START_EVENT, onStart);
    return () => window.removeEventListener(GUEST_SPREAD_START_EVENT, onStart);
  }, [handleStartRequest]);

  useEffect(() => {
    if (!startRequest) return;
    if (handledStartRequestId.current === startRequest.id) return;
    handledStartRequestId.current = startRequest.id;
    handleStartRequest(startRequest.detail);
  }, [startRequest, handleStartRequest]);

  useEffect(() => {
    if (step !== "idle") return;
    if (hasActiveGuestResumeIntent()) {
      clearPendingGuestSpreadStart();
      return;
    }
    const pending = peekPendingGuestSpreadStart();
    if (!pending) return;
    handleStartRequest(pending);
  }, [step, handleStartRequest]);

  useEffect(() => {
    const onReset = () => exitToLanding();
    window.addEventListener(GUEST_SPREAD_RESET_EVENT, onReset);
    return () => window.removeEventListener(GUEST_SPREAD_RESET_EVENT, onReset);
  }, [exitToLanding]);

  useEffect(() => {
    if (step === "idle") return;
    const frame = window.requestAnimationFrame(() => {
      const picker = document.getElementById(GUEST_SPREAD_PICKER_ID);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      picker?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      picker?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  useEffect(() => {
    if (step === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitToLanding();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, exitToLanding]);

  const resolveGuestPicks = useCallback(
    (indices: number[], seed: string) => {
      if (!seed) return;
      const table = buildSeededTableDeck({ system, seed, tableSize });
      const cards = resolvePickedSpread(table, indices);
      if (cards.length < CARD_COUNT) return;
      setDeck(cards);
      setStep("flip");
    },
    [system, tableSize]
  );

  const handleTablePick = useCallback(
    (index: number) => {
      if (ageConfirming) return;
      if (!ageConfirmed) {
        setStep("age");
        return;
      }
      if (pickedIndices.includes(index)) return;
      const next = [...pickedIndices, index];
      setPickedIndices(next);
      if (next.length >= CARD_COUNT) {
        const seed = ensureSessionSeed();
        resolveGuestPicks(next, seed);
      }
    },
    [pickedIndices, resolveGuestPicks, ensureSessionSeed, ageConfirming, ageConfirmed]
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

  const goToEmailRegistration = useCallback(() => {
    trackAuthEmailView("guest_teaser");
    sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY);
    window.location.assign(
      buildRegisterHref(oauthReturnTo, "/", { method: "email" })
    );
  }, [oauthReturnTo]);

  const handleFinish = () => {
    if (deck.length < CARD_COUNT || !allRevealed || completing) return;
    const teaser = buildGuestTripletTeaser(deck);
    const symbols = deck.map((card, index) => ({
      id: card.id,
      name: card.name,
      position: index,
      reversed: Boolean(card.reversed),
    }));

    setCompleting(true);
    setAgeGateError("");

    void (async () => {
      try {
        const res = await fetch("/api/guest-triplet/complete", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            masterId,
            system,
            spreadId: GUEST_RESUME_SPREAD_ID,
            question: landingQuestion || "",
            cards: symbols,
          }),
        });
        if (!res.ok) {
          let code = "";
          try {
            const data = (await res.json()) as { code?: string; error?: string };
            code = String(data.code || data.error || "");
          } catch {
            /* ignore */
          }
          if (
            code === "GUEST_INTRO_NOT_AVAILABLE_AUTHENTICATED" ||
            code === "guest_intro_not_available_authenticated"
          ) {
            trackGuestIntroBlockedAuthenticated("guest_triplet_complete");
            setAgeGateError(
              "Стартовый расклад с лендинга доступен до входа. Откройте карты дня в салоне — раз в сутки."
            );
            setCompleting(false);
            return;
          }
          setAgeGateError(
            res.status === 403
              ? "Подтвердите возраст 18+, чтобы сохранить расклад."
              : "Не удалось сохранить расклад. Попробуйте ещё раз."
          );
          setCompleting(false);
          return;
        }
      } catch {
        setAgeGateError("Не удалось сохранить расклад. Проверьте соединение и попробуйте ещё раз.");
        setCompleting(false);
        return;
      }

      saveGuestTriplet({
        tarotCards: deck,
        deckSystem: system,
        teaser,
        completedAt: new Date().toISOString(),
        question: landingQuestion || undefined,
        masterId,
      });
      saveGuestResumeUiCache({
        version: 1,
        origin: "guest",
        masterId,
        system,
        spreadId: GUEST_RESUME_SPREAD_ID,
        question: landingQuestion || "",
        teaser,
        cards: symbols,
        completedAt: new Date().toISOString(),
        phase: "receipt_pending_auth",
      });
      trackGuestSpreadCompleted();
      clearPendingGuestSpreadStart();
      try { sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY); } catch { /* optional draft */ }
      receiptReadyAtRef.current = Date.now();
      teaserFetchedRef.current = false;
      setTeaserText("");
      setCompleting(false);
      setStep("done");
    })();
  };

  const backToLandingButton = (
    <button
      type="button"
      onClick={exitToLanding}
      className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-aura-gold/25 hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      На главную
    </button>
  );

  if (step === "idle") {
    if (!savedResume) return null;
    return (
      <div className="guest-resume-banner px-4 pb-4">
      <aside className="mx-auto max-w-lg rounded-2xl border border-aura-gold/25 bg-black/40 p-4" aria-label="Сохранённый расклад">
        <p className="font-medium text-aura-champagne">Ваши три карты сохранены</p>
        <p className="mt-1 text-sm text-white/70">Войдите, чтобы продолжить полный разбор этих карт. Пересчёта не будет.</p>
        <a
          href={buildRegisterHref(resolveRegistrationReturnTo({ guestSpread: true, guestMasterId: savedResume.masterId, guestQuestion: savedResume.question || undefined }))}
          onClick={() => trackGuestTeaserCta()}
          className="btn-luxe btn-luxe--md btn-luxe--gold mt-3 w-full"
        >Продолжить сохранённый расклад</a>
      </aside>
      </div>
    );
  }

  if (step === "age") {
    return (
      <GuestSpreadSection>
        <div className={`mx-auto max-w-md px-4 py-10 ${className}`.trim()}>
          {backToLandingButton}
          <div className="glass-panel space-y-5 p-8 text-center">
            <p className="lux-label">Подтверждение возраста</p>
            <h2 className="font-display text-2xl text-white">Сервис только для взрослых 18+</h2>
            <p className="text-sm leading-relaxed text-aura-ivory/70">
              Расклады и диалог с наставником — развлекательно-ознакомительный сервис. Подтвердите,
              что вам исполнилось 18 лет.
            </p>
            {ageGateError ? (
              <p className="text-sm text-red-300/90" role="alert">
                {ageGateError}
              </p>
            ) : null}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={ageConfirming}
                onClick={() => void confirmAgeAndStart()}
                className="btn-luxe btn-luxe--md btn-luxe--gold disabled:opacity-60"
              >
                {ageConfirming ? "Подтверждаем…" : "Мне есть 18 лет — открыть карты"}
              </button>
              <button
                type="button"
                onClick={exitToLanding}
                className="btn-luxe btn-luxe--sm btn-luxe--ghost"
              >
                Вернуться
              </button>
            </div>
          </div>
        </div>
      </GuestSpreadSection>
    );
  }

  if (step === "pick") {
    return (
      <MagicalSpreadTable
        id={GUEST_SPREAD_PICKER_ID}
        tableSize={tableSize}
        cardCount={CARD_COUNT}
        system={system}
        masterId={masterId}
        pickedIndices={pickedIndices}
        onPick={handleTablePick}
        pickHint={ageGateError || ritualCopy.pickHint}
        personalNote={ritualCopy.personalNote}
        title="Выберите три карты"
        standalone
        underSiteHeader
        backLabel="На главную"
        onBack={exitToLanding}
        disabled={ageConfirming}
      />
    );
  }

  if (step === "done") {
    return (
      <GuestSpreadSection>
        <div className={`mx-auto max-w-lg px-4 pb-12 ${className}`.trim()}>
          {backToLandingButton}
          <motion.div
            className="glass-panel space-y-3 p-4 sm:space-y-5 sm:p-8"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <p className="text-center text-sm font-medium text-aura-champagne/85">
              Краткий ориентир по вашему раскладу
            </p>

            {landingQuestion ? (
              <p className="rounded-xl border border-white/8 bg-black/20 px-4 py-3 text-center text-sm text-aura-ivory/80">
                <span className="block text-[11px] uppercase tracking-wide text-aura-ivory/45">
                  Ваш вопрос
                </span>
                <span className="mt-1 block font-medium text-white">{landingQuestion}</span>
              </p>
            ) : null}

            <div className="grid grid-cols-3 items-end gap-2 sm:gap-5">
              {positions.map((pos, i) => (
                <div key={pos} className="flex min-w-0 flex-col items-center gap-2">
                  <p className="lux-label text-center text-[10px]">{pos}</p>
                  <div className="h-[120px] w-full max-w-[80px] sm:h-[196px] sm:max-w-[120px]">
                    <DeckCard
                      card={{ name: deck[i]?.name ?? pos, meaning: deck[i]?.meaning ?? "" }}
                      system={system}
                      reversed={deck[i]?.reversed}
                      showMeaning={false}
                      size="md"
                      className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div
              ref={teaserBlockRef}
              className="guest-spread-teaser rounded-xl border border-aura-gold/20 bg-black/25 p-4 text-left text-sm leading-relaxed text-aura-ivory/85"
              aria-live="polite"
            >
              {teaserLoading || !teaserText ? (
                <div
                  className={`guest-spread-teaser__skeleton${
                    teaserPaused ? " guest-spread-teaser__skeleton--paused" : ""
                  }`}
                  aria-hidden
                >
                  <span />
                  <span />
                  <span />
                </div>
              ) : (
                <p className="guest-spread-teaser__text whitespace-pre-wrap">{teaserText}</p>
              )}
            </div>

            <p className="text-center text-xs text-aura-ivory/50">
              Карты зафиксированы — пересчёта не будет · 18+
            </p>

            {!showAuthGate ? (
              <div className="guest-teaser-conversion space-y-4 rounded-xl border border-aura-gold/25 bg-black/25 p-4 text-left">
                <div>
                  <h3 className="font-display text-lg text-white">
                    Получите полный разбор этих карт
                  </h3>
                  <p className="mt-1 text-sm text-aura-ivory/70">
                    После входа подготовим полный ответ на ваш вопрос. Первый полный разбор этих карт включён бесплатно.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openFullReadingGate}
                  className="btn-primary w-full px-6 py-3.5"
                  data-guest-cta="full_reading"
                >
                  Получить полный разбор
                </button>
                <p className="text-center text-xs text-aura-ivory/50">
                  Ваш вопрос и эти карты уже сохранены.
                </p>
              </div>
            ) : (
              <div
                id={GUEST_TEASER_AUTH_ID}
                className="guest-teaser-auth scroll-mt-28 space-y-4 rounded-xl border border-white/8 bg-black/20 p-4"
              >
                <div>
                  <h3 className="font-display text-lg text-white">
                    Получите полный разбор этих карт
                  </h3>
                  <p className="mt-1 text-sm text-aura-ivory/65">
                    После входа подготовим полный ответ бесплатно. Эти три карты сохранены и не изменятся.
                  </p>
                  <StarterRunesValue
                    variant="badge"
                    product="tarot_guest"
                    costKey="READING"
                    unit={[
                      "расклад Таро с мастером",
                      "расклада Таро с мастером",
                      "раскладов Таро с мастером",
                    ]}
                    className="mt-3"
                  />
                </div>

                <div id="guest-oauth-consent">
                  <OAuthConsentFields
                    acceptedTerms={acceptedTerms}
                    ageConfirmed={oauthAgeConfirmed}
                    marketingConsent={false}
                    onAcceptedTermsChange={setAcceptedTerms}
                    onAgeConfirmedChange={setOauthAgeConfirmed}
                    onMarketingConsentChange={() => undefined}
                    showMarketing={false}
                    showDisclaimer
                    ageConfirmedLocked={ageConfirmedLocked}
                    termsId="guest-oauth-terms"
                    ageId="guest-oauth-age"
                  />
                </div>

                <SocialAuthButtons
                  mode="register"
                  returnTo={oauthReturnTo}
                  requireConsent
                  acceptedTerms={acceptedTerms}
                  ageConfirmed={oauthAgeConfirmed}
                  marketingConsent={false}
                  consentScrollTargetId="guest-oauth-consent"
                  showEmailDivider
                  emailDividerLabel="или email"
                />

                <button
                  type="button"
                  onClick={() => {
                    goToEmailRegistration();
                  }}
                  className="btn-luxe btn-luxe--md btn-luxe--ghost w-full"
                >
                  Продолжить по email
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </GuestSpreadSection>
    );
  }

  return (
    <GuestSpreadSection>
      <div className={`mx-auto mb-12 max-w-3xl px-4 ${className}`.trim()}>
        {backToLandingButton}
        <p className="lux-label mb-2 text-center">{ritualCopy.personalNote}</p>
        <p className="mb-2 text-center text-sm text-aura-ivory/60">{ritualCopy.drawHint}</p>
        <p className="mb-8 text-center text-sm font-medium text-aura-champagne/80">
          {allRevealed ? "Расклад открыт — сохраните результат" : "Нажмите на каждую карту, чтобы открыть"}
        </p>

        {landingQuestion ? (
          <p className="mb-6 text-center text-sm text-aura-ivory/70">
            Вопрос: <span className="text-white">{landingQuestion}</span>
          </p>
        ) : null}

        <div className="mb-6 grid grid-cols-3 items-end justify-items-center gap-2 sm:mb-10 sm:gap-8">
          {positions.map((pos, i) => (
            <div key={pos} className="flex w-full max-w-[148px] min-w-0 flex-col items-center gap-2">
              <p className="lux-label text-center">{pos}</p>
              <button
                type="button"
                onClick={() => handleFlip(i)}
                disabled={revealed[i] || !deck[i]?.name}
                className="perspective-1000 h-[154px] w-full sm:h-[236px] sm:w-[148px]"
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
                      reversed={deck[i]?.reversed}
                      showMeaning={false}
                      size="md"
                      className="h-full [&_.lux-tarot-card]:h-full [&_.lux-tarot-card]:max-w-none"
                    />
                  </div>
                </motion.div>
              </button>
            </div>
          ))}
        </div>

        {ageGateError ? (
          <p className="mb-4 text-center text-sm text-red-300/90" role="alert">
            {ageGateError}
          </p>
        ) : null}

        <div className="text-center">
          <button
            type="button"
            onClick={handleFinish}
            disabled={!allRevealed || completing}
            className="btn-primary px-10 py-3.5 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {completing
              ? "Готовим трактовку…"
              : allRevealed
                ? "Получить трактовку"
                : `Откройте все карты (${revealed.filter(Boolean).length}/${CARD_COUNT})`}
          </button>
        </div>
      </div>
    </GuestSpreadSection>
  );
}
