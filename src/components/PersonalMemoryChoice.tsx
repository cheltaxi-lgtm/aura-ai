"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Check, Loader2, ShieldCheck } from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import LegalDocLink from "@/components/legal/LegalDocLink";
import { trackMemoryProductEvent } from "@/lib/memory/memory-analytics";

export default function PersonalMemoryChoice({
  enabled,
  onPromptBlockingChange,
}: {
  enabled: boolean;
  onPromptBlockingChange?: (blocking: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState(false);
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
      setResolved(false);
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
        if (!cancelled && !res.ok) setOpen(false);
      })
      .catch(() => {
        if (!cancelled) setOpen(false);
      })
      .finally(() => {
        if (!cancelled) setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    onPromptBlockingChange?.(enabled && (!resolved || open));
  }, [enabled, resolved, open, onPromptBlockingChange]);

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
    <aside className="fixed bottom-24 right-4 z-[180] max-h-[calc(100dvh-7rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-aura-gold/25 bg-[#12101a] p-5 shadow-2xl shadow-black/70 sm:bottom-4 sm:max-h-[calc(100dvh-2rem)]" aria-labelledby="personal-memory-title">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aura-gold/10"><Brain className="h-5 w-5 text-aura-gold" aria-hidden /></div>
        <div><h2 id="personal-memory-title" className="font-serif text-xl text-white">Персональная память</h2><p className="mt-1 text-sm leading-5 text-white/65">Следующие консультации смогут продолжить эту тему без повторения вводных.</p></div>
      </div>
      <ul className="mt-3 space-y-2 text-xs text-white/65"><li className="flex gap-2"><Check className="h-4 w-4 text-emerald-400" aria-hidden />Сохранённые сведения можно исправить или удалить.</li><li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-sky-400" aria-hidden />Память включается только после вашего выбора.</li></ul>
      {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={loading} onClick={() => void choose("enabled")} className="btn-primary flex min-h-11 items-center gap-2 px-4 disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}Включить</button><button type="button" disabled={loading} onClick={() => void choose("disabled")} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm text-white/70">Не включать</button></div>
      <p className="mt-3 text-[11px] text-white/38"><LegalDocLink href="/about/personal-memory">Как работает память</LegalDocLink>{" · "}<LegalDocLink href="/privacy">Политика обработки данных</LegalDocLink></p>
    </aside>
    </BodyPortal>
  );
}
