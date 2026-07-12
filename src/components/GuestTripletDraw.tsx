"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { confirmAgeGateOnServer, isAgeGateConfirmed } from "@/lib/age-gate";
import {
  GUEST_SPREAD_START_EVENT,
  LANDING_QUESTION_KEY,
  type GuestSpreadStartDetail,
} from "@/lib/landing-offer";
import {
  trackGuestCardRevealed,
  trackGuestSpreadCompleted,
  trackGuestSpreadStarted,
  trackRegistrationGateView,
} from "@/lib/seo/metrika";
import DeckCard from "@/components/DeckCard";
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

type GuestStep = "age" | "ritual" | "pick" | "flip" | "done";

type GuestTripletDrawProps = {
  className?: string;
};

export default function GuestTripletDraw({ className = "" }: GuestTripletDrawProps) {
  const [masterId, setMasterId] = useState("veronika");
  const system = resolveMasterDeckSystem(masterId);
  const positions = getDeckPositions(system);
  const tableSize = resolveTableSize(system);
  const [step, setStep] = useState<GuestStep>("age");
  const [sessionSeed, setSessionSeed] = useState("");
  const [deck, setDeck] = useState<SpreadSymbol[]>([]);
  const [pickedIndices, setPickedIndices] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([false, false, false]);
  const [ageConfirming, setAgeConfirming] = useState(false);
  const [landingQuestion, setLandingQuestion] = useState("");

  const ritualCopy = useMemo(
    () => getSpreadRitualCopy(masterId, { hasBirthDate: false, cardCount: CARD_COUNT }),
    [masterId]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(LANDING_QUESTION_KEY);
    if (stored) setLandingQuestion(stored);
  }, []);

  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<GuestSpreadStartDetail>).detail;
      const nextQuestion = detail?.question?.trim();
      const nextMasterId = detail?.masterId || "veronika";
      setMasterId(nextMasterId);
      setSessionSeed("");
      setPickedIndices([]);
      setDeck([]);
      setRevealed([false, false, false]);
      if (nextQuestion) {
        sessionStorage.setItem(LANDING_QUESTION_KEY, nextQuestion);
        setLandingQuestion(nextQuestion);
      }
      trackGuestSpreadStarted();
      if (isAgeGateConfirmed()) {
        setStep("ritual");
      } else {
        setStep("age");
      }
      window.requestAnimationFrame(() => {
        document.getElementById("guest-spread")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    window.addEventListener(GUEST_SPREAD_START_EVENT, onStart);
    return () => window.removeEventListener(GUEST_SPREAD_START_EVENT, onStart);
  }, []);

  useEffect(() => {
    if (isAgeGateConfirmed()) setStep("ritual");
  }, []);

  useEffect(() => {
    if (step !== "ritual" || sessionSeed) return;
    setSessionSeed(
      buildGuestSpreadSeed({
        guestId: getGuestId(),
        masterId,
        spreadId: "triplet",
        topic: "guest_preview",
      })
    );
  }, [step, sessionSeed, masterId]);

  const handleAgeConfirm = async () => {
    setAgeConfirming(true);
    const ok = await confirmAgeGateOnServer();
    setAgeConfirming(false);
    if (ok) setStep("ritual");
  };

  const resolveGuestPicks = useCallback(
    (indices: number[]) => {
      if (!sessionSeed) return;
      const table = buildSeededTableDeck({ system, seed: sessionSeed });
      const cards = resolvePickedSpread(table, indices);
      setDeck(cards);
      setStep("flip");
    },
    [sessionSeed, system]
  );

  const handleTablePick = useCallback(
    (index: number) => {
      if (pickedIndices.includes(index)) return;
      const next = [...pickedIndices, index];
      setPickedIndices(next);
      if (next.length >= CARD_COUNT) {
        resolveGuestPicks(next);
      }
    },
    [pickedIndices, resolveGuestPicks]
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

  const handleFinish = () => {
    if (deck.length < CARD_COUNT) return;
    const teaser = `Три карты легли на ваш стол: «${deck[0].name}» · «${deck[1].name}» · «${deck[2].name}». Зарегистрируйтесь — мастер расшифрует расклад.`;
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
  };

  const sharePayload = useMemo(() => {
    if (step !== "done" || deck.length < CARD_COUNT) return null;
    const teaser = `Три карты легли на ваш стол: «${deck[0].name}» · «${deck[1].name}» · «${deck[2].name}». Зарегистрируйтесь — мастер расшифрует расклад.`;
    return tripletToSharePayload({
      userName: "Гость",
      cards: deck,
      deckSystem: system,
      teaser,
    });
  }, [step, deck, system]);

  if (step === "age") {
    return (
      <div className={`mx-auto max-w-md px-4 ${className}`.trim()}>
        <div className="glass-panel space-y-5 p-8 text-center">
          <p className="text-sm leading-relaxed text-aura-ivory/75">
            Бесплатный расклад доступен пользователям от 18 лет. Сервис носит развлекательно-ознакомительный характер.
          </p>
          <button
            type="button"
            onClick={() => void handleAgeConfirm()}
            disabled={ageConfirming}
            className="btn-primary w-full px-8 py-3.5 disabled:opacity-50"
          >
            {ageConfirming ? "..." : "Мне есть 18 лет — открыть расклад"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "ritual") {
    return (
      <div className={`mx-auto max-w-md px-4 ${className}`.trim()}>
        <div className="glass-panel space-y-5 p-8 text-center">
          <p className="lux-label">Бесплатный расклад · 3 карты</p>
          {landingQuestion ? (
            <p className="text-sm text-aura-champagne/80">Ваш вопрос: «{landingQuestion}»</p>
          ) : null}
          <h2 className="font-display text-xl font-semibold text-[#EDE6DA]">{ritualCopy.title}</h2>
          <p className="text-sm leading-relaxed text-aura-ivory/75">{ritualCopy.body}</p>
          <p className="text-xs uppercase tracking-widest text-aura-gold/80">{ritualCopy.personalNote}</p>
          <button
            type="button"
            disabled={!sessionSeed}
            onClick={() => {
              setPickedIndices([]);
              setDeck([]);
              setRevealed([false, false, false]);
              setStep("pick");
            }}
            className="btn-primary w-full px-8 py-3.5 disabled:opacity-50"
          >
            К столу карт
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
          setStep("ritual");
        }}
      />
    );
  }

  if (step === "done") {
    return (
      <motion.div
        className={`glass-panel mx-auto max-w-md space-y-5 p-8 text-center ${className}`.trim()}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <p className="text-sm leading-relaxed text-aura-ivory/75">
          Карты открыты и сохранены. Зарегистрируйтесь — мастер расшифрует расклад и вы сможете задать
          первые вопросы бесплатно.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/auth/user/register?returnTo=%2F%23%D0%BD%D0%B0%D1%81%D1%82%D0%B0%D0%B2%D0%BD%D0%B8%D0%BA%D0%B8"
            className="btn-luxe btn-luxe--md btn-luxe--gold inline-block px-10 py-3.5"
            onClick={() => trackRegistrationGateView("guest_triplet_register")}
          >
            Получить расшифровку
          </Link>
          {sharePayload ? (
            <ShareButton payload={sharePayload} variant="pill" label="Поделиться раскладом" />
          ) : null}
        </div>
      </motion.div>
    );
  }

  return (
    <div className={`mx-auto mb-12 max-w-3xl px-4 ${className}`.trim()}>
      <p className="lux-label mb-2 text-center">{ritualCopy.personalNote}</p>
      <p className="mb-8 text-center text-sm text-aura-ivory/60">{ritualCopy.drawHint}</p>

      <div className="mb-10 flex flex-wrap items-end justify-center gap-5 sm:gap-8">
        {positions.map((pos, i) => (
          <div key={pos} className="flex flex-col items-center gap-2">
            <p className="lux-label">{pos}</p>
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
          </div>
        ))}
      </div>

      {allRevealed && (
        <div className="text-center">
          <button type="button" onClick={handleFinish} className="btn-primary px-10 py-3.5">
            Сохранить расклад и продолжить
          </button>
        </div>
      )}
    </div>
  );
}
