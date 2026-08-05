"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import BodyPortal from "@/components/BodyPortal";
import RitualEntry from "@/components/ritual/RitualEntry";
import RitualQuestions from "@/components/ritual/RitualQuestions";
import RitualSpread from "@/components/ritual/RitualSpread";
import RitualPayment from "@/components/ritual/RitualPayment";
import RitualGenerating, {
  type RitualAchievementPayload,
  type RitualReadyPayload,
} from "@/components/ritual/RitualGenerating";
import RitualCard, { type RitualClientData } from "@/components/ritual/RitualCard";
import RitualReview from "@/components/ritual/RitualReview";
import {
  RITUAL_TYPES,
  isRitualAllowedForMaster,
  needsReview,
  resolveRitualMasterForType,
  type RitualMasterKey,
  type RitualType,
} from "@/lib/ritual-config";
import { usePaywall } from "@/contexts/PaywallContext";
import { isInsufficientRunesError } from "@/lib/insufficient-runes";
import { trackRitualStep } from "@/lib/ritual-analytics";
import { persistOpenRitualIntent } from "@/lib/app-shell-nav";
import {
  buildRegisterHref,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";

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
  /** Fixed master for this session. Pass null to let the user pick from the full 7-type catalog first — the master is then resolved automatically per chosen type. */
  characterKey: RitualMasterKey | null;
  userName: string;
  userZodiac: string;
  balance?: number;
  isUnlimited?: boolean;
  initialRitualId?: string | null;
  /** Auto-start this ritual type when opening (e.g. from daily upsell). */
  initialRitualType?: RitualType | null;
  onClose: () => void;
  onBalanceChange?: (balance: number) => void;
  onAchievement?: (achievement: RitualAchievementPayload) => void;
}

function errorMessageFromBody(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const code = (data as { code?: string }).code;
  if (code === "age_required") {
    return "Доступ к обрядам только для пользователей 18+";
  }
  const error = (data as { error?: string }).error;
  return typeof error === "string" && error.trim() ? error : fallback;
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
  onAchievement,
}: Props) {
  const [step, setStep] = useState<Step>("entry");
  const [ritualId, setRitualId] = useState<string | null>(null);
  const [ritualType, setRitualType] = useState<RitualType | null>(null);
  const [cost, setCost] = useState(0);
  const [localBalance, setLocalBalance] = useState(balance);
  const [ritual, setRitual] = useState<RitualClientData | null>(null);
  const [cards, setCards] = useState<Array<{ name: string; position: string }>>([]);
  const [paying, setPaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [resolvedCharacterKey, setResolvedCharacterKey] = useState<RitualMasterKey | null>(null);
  const openTrackedRef = useRef(false);
  const { openPaywall } = usePaywall();

  /** Resolved master for the active ritual (may rematch if preferred master cannot run the type). */
  const effectiveCharacterKey = resolvedCharacterKey ?? characterKey;

  useEffect(() => {
    setLocalBalance(balance);
  }, [balance]);

  const redirectToRegister = useCallback((type?: RitualType | null) => {
    trackRitualStep("auth_required", type ? { ritualType: type } : undefined);
    persistOpenRitualIntent(type ?? null);
    window.location.href = buildRegisterHref(resolveRegistrationReturnTo());
  }, []);

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
      setResolvedCharacterKey(null);
      setFlowError(null);
      setStarting(false);
      openTrackedRef.current = false;
      return;
    }

    if (!openTrackedRef.current) {
      openTrackedRef.current = true;
      trackRitualStep("open", {
        hasInitialId: Boolean(initialRitualId),
        hasInitialType: Boolean(initialRitualType),
      });
    }

    if (initialRitualId) {
      void (async () => {
        const r = await loadRitual(initialRitualId);
        if (!r) {
          setFlowError("Не удалось загрузить обряд. Попробуйте ещё раз.");
          return;
        }
        setRitualId(r.id);
        setRitualType(r.ritualType);
        setCost(r.runeCost ?? RITUAL_TYPES[r.ritualType].cost);
        setRitual(r);
        setCards(r.cards ?? []);
        if (r.characterKey) {
          setResolvedCharacterKey(r.characterKey as RitualMasterKey);
        }

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
  }, [isOpen, initialRitualId, initialRitualType, loadRitual]);

  const handleStartType = async (type: RitualType) => {
    if (starting) return;
    setFlowError(null);
    setStarting(true);
    trackRitualStep("type_selected", { ritualType: type });
    try {
      // Prefer fixed master when they support the type; otherwise rematch.
      const preferred = characterKey ?? resolvedCharacterKey;
      const master =
        preferred && isRitualAllowedForMaster(preferred, type)
          ? preferred
          : resolveRitualMasterForType(type, preferred);
      setResolvedCharacterKey(master);
      const res = await fetch("/api/ritual/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterKey: master, ritualType: type }),
      });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        /* empty body */
      }
      if (res.status === 401) {
        redirectToRegister(type);
        return;
      }
      if (res.status === 403 && (data as { code?: string } | null)?.code === "age_required") {
        trackRitualStep("age_required", { ritualType: type });
        setFlowError(errorMessageFromBody(data, "Доступ только для пользователей 18+"));
        return;
      }
      if (!res.ok) {
        setFlowError(errorMessageFromBody(data, "Не удалось начать обряд. Попробуйте ещё раз."));
        return;
      }
      const payload = data as { ritualId: string; cost: number };
      setRitualId(payload.ritualId);
      setRitualType(type);
      setCost(payload.cost);
      setStep("questions");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !initialRitualType || initialRitualId || step !== "entry") return;
    void handleStartType(initialRitualType);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-start once per open+type
  }, [isOpen, initialRitualType, initialRitualId, step]);

  const handleSpreadComplete = async (
    drawnCards: Array<{ name: string; position: string }>
  ) => {
    if (!ritualId) return;
    setFlowError(null);
    setCards(drawnCards);
    const res = await fetch(`/api/ritual/${ritualId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: drawnCards }),
    });
    if (!res.ok) {
      trackRitualStep("pay_fail", {
        ritualType: ritualType ?? "unknown",
        reason: "cards_save_failed",
      });
      setFlowError("Не удалось сохранить расклад. Попробуйте ещё раз.");
      setStep("spread");
      return;
    }
    const data = await res.json();
    if (data.balance != null) {
      setLocalBalance(data.balance);
      onBalanceChange?.(data.balance);
    }
    trackRitualStep("spread_done", ritualType ? { ritualType } : undefined);
    setStep("payment");
  };

  const handlePay = useCallback(async () => {
    if (!ritualId) return;
    setPaying(true);
    setFlowError(null);
    trackRitualStep("pay_start", ritualType ? { ritualType, cost } : { cost });
    try {
      const res = await fetch(`/api/ritual/${ritualId}/pay`, { method: "POST" });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        /* empty */
      }
      if (res.status === 401) {
        redirectToRegister(ritualType);
        return;
      }
      if (res.status === 403 && (data as { code?: string } | null)?.code === "age_required") {
        trackRitualStep("age_required", ritualType ? { ritualType } : undefined);
        setFlowError(errorMessageFromBody(data, "Доступ только для пользователей 18+"));
        return;
      }
      if (res.status === 402 && isInsufficientRunesError(data)) {
        const payload = data as {
          balance?: number;
          required?: number;
          shortage?: number;
        };
        trackRitualStep("pay_insufficient", ritualType ? { ritualType, cost } : { cost });
        openPaywall({
          currentBalance: payload.balance ?? localBalance,
          requiredRunes: payload.required ?? cost,
          shortage: payload.shortage ?? cost - localBalance,
        });
        return;
      }
      if (!res.ok) {
        trackRitualStep("pay_fail", ritualType ? { ritualType } : undefined);
        setFlowError(errorMessageFromBody(data, "Оплата не прошла. Попробуйте ещё раз."));
        return;
      }
      const payload = data as { balance?: number };
      if (payload.balance != null) {
        setLocalBalance(payload.balance);
        onBalanceChange?.(payload.balance);
      }
      trackRitualStep("pay_ok", ritualType ? { ritualType, cost } : { cost });
      setStep("generating");
    } finally {
      setPaying(false);
    }
  }, [ritualId, ritualType, localBalance, cost, openPaywall, onBalanceChange, redirectToRegister]);

  const handleGenerated = useCallback(
    async (payload?: RitualReadyPayload | null) => {
      if (!ritualId) return;
      const achievement = payload?.achievement;
      let r = await loadRitual(ritualId);
      if (!r && payload?.ritual && typeof payload.ritual === "object") {
        r = payload.ritual as unknown as RitualClientData;
      }
      if (r) {
        setRitual(r);
        trackRitualStep("generate_ok", { ritualType: r.ritualType });
        trackRitualStep("card_view", { ritualType: r.ritualType });
        setStep("card");
      } else {
        setFlowError(
          "Обряд готов, но не удалось загрузить карточку. Откройте его в кабинете."
        );
        onClose();
      }
      if (achievement?.label) {
        onAchievement?.(achievement);
      }
    },
    [ritualId, loadRitual, onAchievement, onClose]
  );

  const handleGenerationFailed = useCallback(
    async (opts?: { refunded?: boolean }) => {
      trackRitualStep(
        "generate_fail",
        ritualType
          ? { ritualType, refunded: Boolean(opts?.refunded) }
          : { refunded: Boolean(opts?.refunded) }
      );
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
      setFlowError(
        opts?.refunded
          ? "Не удалось собрать обряд. Руны возвращены — можно попробовать ещё раз."
          : "Не удалось собрать обряд. Попробуйте ещё раз."
      );
      setStep("payment");
    },
    [ritualId, ritualType, onBalanceChange]
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
          className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-aura-bg sm:mx-4 sm:rounded-2xl"
        >
          <div className="lux-scroll flex-1 overflow-y-auto overscroll-contain">
            {flowError &&
              (step === "entry" || step === "payment" || step === "spread") && (
              <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {flowError}
              </div>
            )}

            {step === "entry" && (
              <RitualEntry
                characterKey={characterKey}
                allTypes={!characterKey}
                onStart={(type) => void handleStartType(type)}
                onClose={onClose}
                balance={localBalance}
              />
            )}

            {step === "questions" && ritualId && ritualType && effectiveCharacterKey && (
              <RitualQuestions
                ritualId={ritualId}
                characterKey={effectiveCharacterKey}
                ritualType={ritualType}
                userName={userName}
                userZodiac={userZodiac}
                onComplete={() => {
                  trackRitualStep("questions_done", { ritualType });
                  setStep("spread");
                }}
              />
            )}

            {step === "spread" && ritualId && effectiveCharacterKey && (
              <RitualSpread
                characterKey={effectiveCharacterKey}
                ritualId={ritualId}
                cost={cost}
                isUnlimited={isUnlimited}
                onComplete={(c) => void handleSpreadComplete(c)}
              />
            )}

            {step === "payment" && ritualType && effectiveCharacterKey && (
              <RitualPayment
                ritualType={ritualType}
                characterKey={effectiveCharacterKey}
                cost={cost}
                balance={localBalance}
                isUnlimited={isUnlimited}
                cards={cards}
                onPay={() => void handlePay()}
                paying={paying}
              />
            )}

            {step === "generating" && ritualId && effectiveCharacterKey && (
              <RitualGenerating
                characterKey={effectiveCharacterKey}
                ritualId={ritualId}
                onReady={handleGenerated}
                onFailed={handleGenerationFailed}
              />
            )}

            {step === "card" && ritual && (
              <RitualCard ritual={ritual} onDone={onClose} />
            )}

            {step === "review" && ritualId && effectiveCharacterKey && (
              <RitualReview
                ritualId={ritualId}
                characterKey={effectiveCharacterKey}
                onComplete={() => {
                  trackRitualStep(
                    "review_done",
                    ritualType ? { ritualType } : undefined
                  );
                  onClose();
                }}
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
