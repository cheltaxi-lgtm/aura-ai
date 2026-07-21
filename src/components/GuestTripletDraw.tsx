"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
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
import { saveGuestResumeUiCache } from "@/lib/guest-resume-ui-cache";
import { buildGuestTripletPreview, buildGuestTripletTeaser } from "@/lib/guest-triplet-teaser";
import { GUEST_RESUME_SPREAD_ID } from "@/lib/guest-triplet-receipt-shared";
import { confirmAgeGateOnServer, isAgeGateConfirmed } from "@/lib/age-gate";
import {
  GUEST_SPREAD_DRAFT_KEY,
  GUEST_SPREAD_RESET_EVENT,
  GUEST_SPREAD_SECTION_ID,
  GUEST_SPREAD_START_EVENT,
  GUEST_TRIPLET_MASTER_ID,
  LANDING_QUESTION_KEY,
  type GuestSpreadStartDetail,
} from "@/lib/landing-offer";
import {
  buildRegisterHref,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import OAuthConsentFields from "@/components/auth/OAuthConsentFields";
import {
  trackGuestCardRevealed,
  trackGuestSpreadCompleted,
  trackGuestSpreadStarted,
  trackRegistrationCtaClick,
  trackRegistrationGateView,
} from "@/lib/seo/metrika";
import DeckCard from "@/components/DeckCard";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import MagicalSpreadTable from "@/components/MagicalSpreadTable";
import ShareButton from "@/components/share/ShareButton";
import { tripletToSharePayload } from "@/lib/share/payload-builders";

const GUEST_ID_KEY = "zovus_guest_id";
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
};

function GuestSpreadSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="aura-landing-section aura-landing-section--guest-spread">
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

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
  const masterId = GUEST_TRIPLET_MASTER_ID;
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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [oauthAgeConfirmed, setOauthAgeConfirmed] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

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

  const previewText = useMemo(() => {
    if (deck.length < CARD_COUNT) return "";
    return buildGuestTripletPreview(deck, positions);
  }, [deck, positions]);

  useEffect(() => {
    if (typeof window === "undefined" || draftRestored) return;
    const stored = sessionStorage.getItem(LANDING_QUESTION_KEY);
    if (stored) setLandingQuestion(stored);
    setAgeConfirmed(isAgeGateConfirmed());
    setOauthAgeConfirmed(isAgeGateConfirmed());

    const draft = readGuestSpreadDraft();
    if (draft && draft.masterId === GUEST_TRIPLET_MASTER_ID) {
      let restoredStep = draft.step === "intro" ? "pick" : draft.step;
      if (
        (restoredStep === "pick" || restoredStep === "flip") &&
        !isAgeGateConfirmed()
      ) {
        restoredStep = "age";
      }
      setStep(restoredStep);
      setSessionSeed(draft.sessionSeed);
      setPickedIndices(draft.pickedIndices);
      setDeck(draft.deck);
      setRevealed(draft.revealed);
      setLandingQuestion(draft.landingQuestion);
    } else if (draft) {
      sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY);
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

  const exitToLanding = useCallback(() => {
    resetSpreadState();
    setAgeGateError("");
    setStep("idle");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [resetSpreadState]);

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
    setAgeConfirming(true);
    setAgeGateError("");
    const ok = await confirmAgeGateOnServer();
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

  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<GuestSpreadStartDetail>).detail;
      const nextQuestion = detail?.question?.trim();
      if (nextQuestion) {
        sessionStorage.setItem(LANDING_QUESTION_KEY, nextQuestion);
        setLandingQuestion(nextQuestion);
      }
      if (isAgeGateConfirmed()) {
        setAgeConfirmed(true);
        beginGuestSpread(nextQuestion);
        return;
      }
      setAgeGateError("");
      setStep("age");
    };
    window.addEventListener(GUEST_SPREAD_START_EVENT, onStart);
    return () => window.removeEventListener(GUEST_SPREAD_START_EVENT, onStart);
  }, [beginGuestSpread]);

  useEffect(() => {
    const onReset = () => exitToLanding();
    window.addEventListener(GUEST_SPREAD_RESET_EVENT, onReset);
    return () => window.removeEventListener(GUEST_SPREAD_RESET_EVENT, onReset);
  }, [exitToLanding]);

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
      window.requestAnimationFrame(() => {
        document.getElementById(GUEST_SPREAD_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [system, tableSize]
  );

  const handleTablePick = useCallback(
    (index: number) => {
      if (ageConfirming) return;
      if (!ageConfirmed && !isAgeGateConfirmed()) {
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

  const goToRegistration = useCallback(() => {
    trackRegistrationCtaClick("guest_triplet_register");
    sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY);
    window.location.assign(
      buildRegisterHref(
        resolveRegistrationReturnTo({
          guestSpread: true,
          guestMasterId: masterId,
          guestQuestion: landingQuestion || undefined,
        }),
        "/",
        { method: "email" }
      )
    );
  }, [masterId, landingQuestion]);

  const handleFinish = () => {
    if (deck.length < CARD_COUNT || !allRevealed) return;
    const teaser = buildGuestTripletTeaser(deck);
    const symbols = deck.map((card, index) => ({
      id: card.id,
      name: card.name,
      position: index,
      reversed: false,
    }));

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
          setAgeGateError(
            res.status === 403
              ? "Подтвердите возраст 18+, чтобы сохранить расклад."
              : "Не удалось сохранить расклад. Попробуйте ещё раз."
          );
          return;
        }
      } catch {
        setAgeGateError("Не удалось сохранить расклад. Проверьте соединение и попробуйте ещё раз.");
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
      trackRegistrationGateView("guest_triplet_done");
      setStep("done");
      sessionStorage.removeItem(GUEST_SPREAD_DRAFT_KEY);
      window.requestAnimationFrame(() => {
        document.getElementById("guest-spread")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    })();
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
    return null;
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
              Расклады и диалог с ИИ-наставником — развлекательно-ознакомительный сервис. Подтвердите,
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
      <div className={`mx-auto max-w-lg px-4 ${className}`.trim()}>
        {backToLandingButton}
      <motion.div
        className="glass-panel space-y-5 p-8"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <p className="text-center text-sm font-medium text-aura-champagne/85">Краткий ориентир по вашему раскладу</p>
        <div className="guest-spread-preview rounded-xl border border-aura-gold/20 bg-black/25 p-4 text-left text-sm text-aura-ivory/80">
          <PremiumReadingBody content={previewText} className="text-aura-ivory/80" />
        </div>
        <p className="text-center text-sm leading-relaxed text-aura-ivory/65">
          Зарегистрируйтесь — мастер даст полную связную расшифровку, и вы сможете задать первые вопросы
          бесплатно.
        </p>

        <div id="guest-oauth-consent" className="rounded-xl border border-white/8 bg-black/20 p-4">
          <OAuthConsentFields
            acceptedTerms={acceptedTerms}
            ageConfirmed={oauthAgeConfirmed}
            marketingConsent={marketingConsent}
            onAcceptedTermsChange={setAcceptedTerms}
            onAgeConfirmedChange={setOauthAgeConfirmed}
            onMarketingConsentChange={setMarketingConsent}
            showDisclaimer
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
          marketingConsent={marketingConsent}
          consentScrollTargetId="guest-oauth-consent"
          showEmailDivider
          emailDividerLabel="или email"
        />

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={goToRegistration}
            className="btn-luxe btn-luxe--md btn-luxe--ghost inline-block px-10 py-3.5 text-center"
          >
            Регистрация по email
          </button>
          {sharePayload ? (
            <ShareButton payload={sharePayload} variant="pill" label="Поделиться раскладом" />
          ) : null}
        </div>
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
    </GuestSpreadSection>
  );
}
