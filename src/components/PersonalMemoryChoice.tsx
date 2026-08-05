"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Check, Loader2, ShieldCheck } from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import LegalDocLink from "@/components/legal/LegalDocLink";
import { trackMemoryProductEvent } from "@/lib/memory/memory-analytics";

export default function PersonalMemoryChoice({
  enabled,
}: {
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [experiment, setExperiment] = useState<{
    promptVersion: string;
    variant: "continuity" | "history";
  } | null>(null);
  const trackedShown = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }
    let cancelled = false;
    void fetch("/api/memory/preferences", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          needsInitialChoice?: boolean;
          memoryExperiment?: {
            promptVersion?: string;
            variant?: "continuity" | "history";
          };
        };
        if (!cancelled && res.ok) {
          setOpen(Boolean(data.needsInitialChoice));
          if (data.memoryExperiment?.promptVersion && data.memoryExperiment.variant) {
            setExperiment({
              promptVersion: data.memoryExperiment.promptVersion,
              variant: data.memoryExperiment.variant,
            });
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!open || trackedShown.current) return;
    trackedShown.current = true;
    trackMemoryProductEvent({
      event: "consent_prompt_shown",
      promptVersion: experiment?.promptVersion,
      variant: experiment?.variant,
    });
  }, [experiment, open]);

  const choose = async (choice: "enabled" | "disabled") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memory/preferences", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          choice,
          pdConsent: choice === "enabled" ? true : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "save_failed");
      trackMemoryProductEvent({
        event: choice === "enabled" ? "consent_choice_enabled" : "consent_choice_disabled",
        promptVersion: experiment?.promptVersion,
        variant: experiment?.variant,
        memoryEnabled: choice === "enabled",
        autoCaptureEnabled: choice === "enabled",
        momentsMode: "active",
      });
      setOpen(false);
      window.dispatchEvent(
        new CustomEvent("personal-memory-choice", { detail: { choice } })
      );
    } catch {
      setError("Не удалось сохранить выбор. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-[180] flex items-center justify-center bg-[#08060d]/92 px-4 py-8 backdrop-blur-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="personal-memory-title"
      >
        <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-aura-gold/25 bg-[#12101a] shadow-2xl shadow-black/70">
          <div className="border-b border-white/8 bg-gradient-to-br from-aura-gold/12 via-transparent to-aura-gold/8 px-6 py-7 sm:px-8">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-aura-gold/25 bg-aura-gold/10">
              <Brain className="h-7 w-7 text-aura-gold" aria-hidden />
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-aura-gold/75">
              Ваш личный контекст
            </p>
            <h2 id="personal-memory-title" className="font-serif text-3xl text-white">
              Персональная память
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/65">
              {experiment?.variant === "history"
                ? "Вы сможете видеть, как менялись ваши вопросы и жизненные обстоятельства, а консультации — продолжать эту историю без повторения вводных."
                : "Следующие консультации смогут продолжать важную для вас линию, а не начинать знакомство заново. Сервис подберёт только то, что относится к новому вопросу."}
            </p>
          </div>

          <div className="space-y-4 px-6 py-6 sm:px-8">
            <ul className="space-y-3 text-sm text-white/72">
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                Замечайте траекторию: что изменилось с прошлого разговора и какой шаг следует дальше.
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden />
                Вы увидите сохранённые сведения и сможете исправить или удалить каждое из них.
              </li>
            </ul>

            {error ? (
              <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              disabled={loading}
              onClick={() => void choose("enabled")}
              className="btn-primary flex w-full items-center justify-center gap-2 px-5 py-3.5 font-semibold disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Включить память
              <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                рекомендуется
              </span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void choose("disabled")}
              className="w-full rounded-xl border border-white/10 px-5 py-3 text-sm text-white/65 transition hover:border-white/20 hover:text-white disabled:opacity-50"
            >
              Не включать
            </button>

            <p className="text-center text-[11px] leading-5 text-white/38">
              Выбор можно изменить, а память полностью очистить в кабинете.{" "}
              <LegalDocLink href="/about/personal-memory">Как работает память</LegalDocLink>
              {" · "}
              <LegalDocLink href="/privacy">Политика обработки данных</LegalDocLink>
            </p>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
