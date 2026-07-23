"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getCharacterById } from "@/lib/characters";

const RAGNAR_RUNES = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ"];
const AGAFYA_SYMBOLS = ["🌿", "🧵", "💧", "🌾", "✨"];
const VERONIKA_SYMBOLS = ["🕯", "🪞", "🌙", "💫", "🤍"];
const SHRI_RAJ_SYMBOLS = ["🔥", "🕉", "✨", "🪔", "🌌"];
const NUMEROLOG_SYMBOLS = ["7", "3", "9", "🔢", "✦"];

const GENERATING_SYMBOLS: Record<string, string[]> = {
  ragnar: RAGNAR_RUNES,
  agafya: AGAFYA_SYMBOLS,
  veronika: VERONIKA_SYMBOLS,
  "shri-raj": SHRI_RAJ_SYMBOLS,
  numerolog: NUMEROLOG_SYMBOLS,
};

const PHASES = [
  { key: "moon", label: "сверяет лунное окно…" },
  { key: "cards", label: "читает ваш расклад…" },
  { key: "items", label: "подбирает атрибуты…" },
  { key: "steps", label: "складывает шаги обряда…" },
  { key: "words", label: "формулирует слово силы…" },
  { key: "done", label: "почти готово…" },
] as const;

const POLL_MS = 2500;
const FAIL_AFTER_MS = 180_000;
const GENERATE_TIMEOUT_MS = 130_000;

export interface RitualAchievementPayload {
  label: string;
  description: string;
  bonus: number;
  phrase: string;
}

export type RitualReadyPayload = {
  achievement?: RitualAchievementPayload | null;
  ritual?: Record<string, unknown> | null;
};

interface Props {
  characterKey: string;
  ritualId: string;
  onReady: (payload?: RitualReadyPayload | null) => void;
  onFailed: (opts?: { refunded?: boolean }) => void;
}

export default function RitualGenerating({
  characterKey,
  ritualId,
  onReady,
  onFailed,
}: Props) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [refunded, setRefunded] = useState(false);
  const attemptRef = useRef(0);
  const onReadyRef = useRef(onReady);
  const onFailedRef = useRef(onFailed);

  useEffect(() => {
    onReadyRef.current = onReady;
    onFailedRef.current = onFailed;
  }, [onReady, onFailed]);

  const masterName = getCharacterById(characterKey)?.name ?? "Мастер";
  const symbols = GENERATING_SYMBOLS[characterKey] ?? AGAFYA_SYMBOLS;

  useEffect(() => {
    const interval = setInterval(() => {
      setPhaseIndex((i) => (i + 1) % PHASES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const pollStatus = useCallback(async (): Promise<"completed" | "failed" | "pending"> => {
    try {
      const res = await fetch(`/api/ritual/${ritualId}`);
      if (!res.ok) return "pending";
      const data = await res.json();
      const status = data.ritual?.status as string | undefined;
      if (status === "completed" || status === "reviewed") return "completed";
      if (status === "payment") return "failed";
    } catch {
      /* retry poll */
    }
    return "pending";
  }, [ritualId]);

  const handleGenerationResult = useCallback(
    (
      data: {
        status?: string;
        error?: string;
        ritual?: { status?: string } & Record<string, unknown>;
        achievement?: RitualAchievementPayload | null;
      },
      resOk: boolean
    ) => {
      if ((resOk && data.status === "completed") || data.ritual?.status === "completed") {
        onReadyRef.current({
          achievement: data.achievement ?? null,
          ritual: data.ritual ?? null,
        });
        return true;
      }
      if (
        data.status === "failed" ||
        data.error === "generation_failed" ||
        data.error === "generation_error" ||
        data.error === "needs_payment"
      ) {
        const wasPaidRefund = Boolean(
          (data as { refunded?: boolean }).refunded
        );
        setRefunded(wasPaidRefund || data.error === "needs_payment");
        setError(
          data.error === "needs_payment"
            ? "Оплата не завершена. Вернитесь к оплате и получите обряд снова."
            : wasPaidRefund
              ? "Не удалось составить обряд. Руны возвращены на баланс — попробуйте ещё раз."
              : "Не удалось составить обряд. Попробуйте ещё раз."
        );
        return true;
      }
      return false;
    },
    []
  );

  const triggerGeneration = useCallback(
    async (isRetry: boolean): Promise<boolean> => {
      attemptRef.current += 1;
      setIsGenerating(true);
      if (!isRetry) setError(null);

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

      try {
        const { postWithAsyncJob } = await import("@/lib/client/wait-for-async-job");
        const { status, data } = await postWithAsyncJob({
          url: `/api/ritual/${ritualId}/regenerate`,
          body: {},
          storageKey: `aura:ritual-active-job:${ritualId}`,
          signal: controller.signal,
        });
        return handleGenerationResult(
          data as {
            status?: string;
            error?: string;
            ritual?: { status?: string };
            achievement?: RitualAchievementPayload | null;
          },
          status < 400
        );
      } catch {
        return false;
      } finally {
        window.clearTimeout(timer);
        setIsGenerating(false);
      }
    },
    [ritualId, handleGenerationResult]
  );

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    void (async () => {
      const firstDone = await triggerGeneration(false);
      if (cancelled || firstDone) return;

      while (!cancelled) {
        const status = await pollStatus();
        if (status === "completed") {
          onReadyRef.current();
          return;
        }
        if (status === "failed") {
          setRefunded(true);
          setError(
            "Не удалось составить обряд. Руны возвращены — попробуйте ещё раз."
          );
          return;
        }

        const elapsed = Date.now() - startedAt;
        if (elapsed >= FAIL_AFTER_MS) {
          setError(
            "Генерация занимает слишком долго. Закройте окно и откройте обряд снова — или вернитесь к оплате."
          );
          return;
        }

        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ritualId, triggerGeneration, pollStatus]);

  const handleRetry = () => {
    void triggerGeneration(true);
  };

  if (error) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-sm text-amber-100/80">{error}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {refunded ? (
            <button
              type="button"
              onClick={() => onFailedRef.current({ refunded: true })}
              className="btn-luxe btn-luxe--md btn-luxe--gold"
            >
              Вернуться к оплате
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isGenerating}
              className="btn-luxe btn-luxe--md btn-luxe--gold"
            >
              {isGenerating ? "Повтор…" : "Попробовать снова"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onFailedRef.current({ refunded })}
            className="btn-luxe btn-luxe--md btn-luxe--ghost"
          >
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  const phase = PHASES[phaseIndex];
  const showRetryLabel = isGenerating && attemptRef.current > 1;

  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-10">
      <div className="mb-4 w-full max-w-sm">
        {/* lazy import avoided — tiny notice */}
        {isGenerating ? (
          <div
            role="status"
            className="rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs leading-relaxed text-amber-50/90"
          >
            <p className="font-medium text-amber-100">Составляем обряд</p>
            <p className="mt-1 text-amber-50/70">
              Можно закрыть страницу — результат сохранится. После обновления
              ожидание восстановится автоматически.
            </p>
          </div>
        ) : null}
      </div>
      <div className="relative mb-8 flex h-32 w-32 items-center justify-center">
        {symbols.map((sym, i) => (
          <motion.span
            key={i}
            className="absolute text-2xl"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0.5, 1.2, 0.5],
              x: Math.cos((i / symbols.length) * Math.PI * 2) * 40,
              y: Math.sin((i / symbols.length) * Math.PI * 2) * 40,
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.25,
            }}
          >
            {sym}
          </motion.span>
        ))}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="h-16 w-16 rounded-full border-2 border-amber-400/30 border-t-amber-400"
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={showRetryLabel ? "retry" : phase.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="text-center text-sm text-amber-200/80"
        >
          {showRetryLabel
            ? `${masterName} повторяет обряд…`
            : `${masterName} ${phase.label}`}
        </motion.p>
      </AnimatePresence>

      <p className="mt-6 max-w-xs text-center text-xs text-white/40">
        Персональный ритуал: время по луне, атрибуты, шаги и слово силы
      </p>
    </div>
  );
}
