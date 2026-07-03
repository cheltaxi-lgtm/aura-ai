"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const RAGNAR_RUNES = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ"];
const AGAFYA_SYMBOLS = ["🌿", "🧵", "💧", "🌾", "✨"];

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

interface Props {
  characterKey: string;
  ritualId: string;
  onReady: () => void;
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

  const masterName = characterKey === "ragnar" ? "Рагнар" : "Агафья";
  const symbols = characterKey === "ragnar" ? RAGNAR_RUNES : AGAFYA_SYMBOLS;

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
    (data: { status?: string; error?: string; ritual?: { status?: string } }, resOk: boolean) => {
      if ((resOk && data.status === "completed") || data.ritual?.status === "completed") {
        onReadyRef.current();
        return true;
      }
      if (
        data.status === "failed" ||
        data.error === "generation_failed" ||
        data.error === "generation_error" ||
        data.error === "needs_payment"
      ) {
        setRefunded(true);
        setError(
          data.error === "needs_payment"
            ? "Оплата не завершена. Вернитесь к оплате и получите обряд снова."
            : "Не удалось составить обряд. Руны возвращены на баланс — попробуйте ещё раз."
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
        const res = await fetch(`/api/ritual/${ritualId}/regenerate`, {
          method: "POST",
          signal: controller.signal,
        });
        const data = (await res.json()) as {
          status?: string;
          error?: string;
          ritual?: { status?: string };
        };
        return handleGenerationResult(data, res.ok);
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
