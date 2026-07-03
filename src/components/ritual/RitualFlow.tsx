"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import BodyPortal from "@/components/BodyPortal";
import RitualEntry from "@/components/ritual/RitualEntry";
import RitualQuestions from "@/components/ritual/RitualQuestions";
import RitualSpread from "@/components/ritual/RitualSpread";
import RitualPayment from "@/components/ritual/RitualPayment";
import RitualGenerating from "@/components/ritual/RitualGenerating";
import RitualCard, { type RitualClientData } from "@/components/ritual/RitualCard";
import RitualReview from "@/components/ritual/RitualReview";
import {
  RITUAL_TYPES,
  needsReview,
  type RitualMasterKey,
  type RitualType,
} from "@/lib/ritual-config";
import { usePaywall } from "@/contexts/PaywallContext";
import { isInsufficientRunesError } from "@/lib/insufficient-runes";

type Step =
  | "entry"
  | "questions"
  | "spread"
  | "payment"
  | "generating"
  | "card"
  | "review";

interface Props {
  isOpen: boolean;
  characterKey: RitualMasterKey;
  userName: string;
  userZodiac: string;
  balance?: number;
  isUnlimited?: boolean;
  initialRitualId?: string | null;
  /** Auto-start this ritual type when opening (e.g. from daily upsell). */
  initialRitualType?: RitualType | null;
  onClose: () => void;
  onBalanceChange?: (balance: number) => void;
}

export default function RitualFlow({
  isOpen,
  characterKey,
  userName,
  userZodiac,
  balance = 0,
  isUnlimited = false,
  initialRitualId,
  initialRitualType,
  onClose,
  onBalanceChange,
}: Props) {
  const [step, setStep] = useState<Step>("entry");
  const [ritualId, setRitualId] = useState<string | null>(null);
  const [ritualType, setRitualType] = useState<RitualType | null>(null);
  const [cost, setCost] = useState(0);
  const [localBalance, setLocalBalance] = useState(balance);
  const [ritual, setRitual] = useState<RitualClientData | null>(null);
  const [cards, setCards] = useState<Array<{ name: string; position: string }>>([]);
  const [paying, setPaying] = useState(false);
  const { openPaywall } = usePaywall();

  useEffect(() => {
    setLocalBalance(balance);
  }, [balance]);

  const loadRitual = useCallback(async (id: string) => {
    const res = await fetch(`/api/ritual/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.ritual as RitualClientData;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setStep("entry");
      setRitualId(null);
      setRitualType(null);
      setRitual(null);
      return;
    }

    if (initialRitualId) {
      void (async () => {
        const r = await loadRitual(initialRitualId);
        if (!r) return;
        setRitualId(r.id);
        setRitualType(r.ritualType);
        setCost(r.runeCost ?? RITUAL_TYPES[r.ritualType].cost);
        setRitual(r);
        setCards(r.cards ?? []);

        if (r.status === "reviewed") setStep("card");
        else if (needsReview(r)) setStep("review");
        else if (r.status === "completed") setStep("card");
        else if (r.status === "generating") setStep("generating");
        else if (r.status === "payment") setStep("payment");
        else if (r.status === "spread") setStep("spread");
        else if (r.status === "questions") setStep("questions");
        else setStep("entry");
      })();
    }
  }, [isOpen, initialRitualId, loadRitual]);

  const handleStartType = async (type: RitualType) => {
    const res = await fetch("/api/ritual/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterKey, ritualType: type }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setRitualId(data.ritualId);
    setRitualType(type);
    setCost(data.cost);
    setStep("questions");
  };

  useEffect(() => {
    if (!isOpen || !initialRitualType || initialRitualId || step !== "entry") return;
    void handleStartType(initialRitualType);
  }, [isOpen, initialRitualType, initialRitualId, step]);

  const handleSpreadComplete = async (
    drawnCards: Array<{ name: string; position: string }>
  ) => {
    if (!ritualId) return;
    setCards(drawnCards);
    const res = await fetch(`/api/ritual/${ritualId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: drawnCards }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.balance != null) {
        setLocalBalance(data.balance);
        onBalanceChange?.(data.balance);
      }
    }
    setStep("payment");
  };

  const handlePay = useCallback(async () => {
    if (!ritualId) return;
    setPaying(true);
    try {
      const res = await fetch(`/api/ritual/${ritualId}/pay`, { method: "POST" });
      const data = await res.json();
      if (res.status === 402 && isInsufficientRunesError(data)) {
        openPaywall({
          currentBalance: data.balance ?? localBalance,
          requiredRunes: data.required ?? cost,
          shortage: data.shortage ?? cost - localBalance,
        });
        return;
      }
      if (!res.ok) return;
      if (data.balance != null) {
        setLocalBalance(data.balance);
        onBalanceChange?.(data.balance);
      }
      setStep("generating");
    } finally {
      setPaying(false);
    }
  }, [ritualId, localBalance, cost, openPaywall, onBalanceChange]);

  const handleGenerated = useCallback(async () => {
    if (!ritualId) return;
    const r = await loadRitual(ritualId);
    if (r) {
      setRitual(r);
      setStep("card");
    }
  }, [ritualId, loadRitual]);

  const handleGenerationFailed = useCallback(
    async (opts?: { refunded?: boolean }) => {
      if (opts?.refunded && ritualId) {
        try {
          const res = await fetch("/api/runes/balance", { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            if (typeof data.balance === "number") {
              setLocalBalance(data.balance);
              onBalanceChange?.(data.balance);
            }
          }
        } catch {
          /* ignore */
        }
      }
      setStep("payment");
    },
    [ritualId, onBalanceChange]
  );

  if (!isOpen) return null;

  return (
    <BodyPortal active={isOpen}>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[4990] flex items-end justify-center sm:items-center pointer-events-auto"
          data-flow-overlay="true"
          role="dialog"
          aria-modal="true"
        >
        <button
          type="button"
          className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          onClick={onClose}
          aria-label="Закрыть"
        />
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0a0a0f] sm:mx-4 sm:rounded-2xl"
        >
          <div className="lux-scroll flex-1 overflow-y-auto overscroll-contain">
            {step === "entry" && (
              <RitualEntry
                characterKey={characterKey}
                onStart={(type) => void handleStartType(type)}
                onClose={onClose}
                balance={localBalance}
              />
            )}

            {step === "questions" && ritualId && ritualType && (
              <RitualQuestions
                ritualId={ritualId}
                characterKey={characterKey}
                ritualType={ritualType}
                userName={userName}
                userZodiac={userZodiac}
                onComplete={() => setStep("spread")}
              />
            )}

            {step === "spread" && ritualId && (
              <RitualSpread
                characterKey={characterKey}
                ritualId={ritualId}
                cost={cost}
                isUnlimited={isUnlimited}
                onComplete={(c) => void handleSpreadComplete(c)}
              />
            )}

            {step === "payment" && ritualType && (
              <RitualPayment
                ritualType={ritualType}
                characterKey={characterKey}
                cost={cost}
                balance={localBalance}
                isUnlimited={isUnlimited}
                cards={cards}
                onPay={() => void handlePay()}
                paying={paying}
              />
            )}

            {step === "generating" && ritualId && (
              <RitualGenerating
                characterKey={characterKey}
                ritualId={ritualId}
                onReady={handleGenerated}
                onFailed={handleGenerationFailed}
              />
            )}

            {step === "card" && ritual && (
              <RitualCard ritual={ritual} onDone={onClose} />
            )}

            {step === "review" && ritualId && (
              <RitualReview
                ritualId={ritualId}
                characterKey={characterKey}
                onComplete={onClose}
                onSkip={onClose}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
      </AnimatePresence>
    </BodyPortal>
  );
}
