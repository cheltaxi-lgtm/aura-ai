"use client";

import { useEffect, useState } from "react";
import { Brain, Check, Loader2, X } from "lucide-react";
import { trackMemoryProductEvent } from "@/lib/memory/memory-analytics";

type SuggestedFact = {
  factId: string;
  fact: string;
  category: string | null;
};

export default function MemoryAnchorSuggestion({
  sessionId,
  queryText,
  active,
}: {
  sessionId?: string;
  queryText: string;
  active: boolean;
}) {
  const [suggestion, setSuggestion] = useState<SuggestedFact | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = queryText.trim();
    if (!active || !sessionId || query.length < 8) {
      setSuggestion(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/memory/session-facts?sessionId=${encodeURIComponent(sessionId)}&query=${encodeURIComponent(query)}`,
        { credentials: "include", cache: "no-store" }
      )
        .then(async (res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled) setSuggestion(data?.facts?.[0] ?? null);
        })
        .catch(() => undefined);
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, queryText, sessionId]);

  const decide = async (decision: "included" | "excluded") => {
    if (!sessionId || !suggestion || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/memory/session-facts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, factId: suggestion.factId, decision }),
      });
      if (!res.ok) return;
      trackMemoryProductEvent({
        event: decision === "included" ? "memory_anchor_included" : "memory_anchor_excluded",
        sessionId,
        sourceType: "chat",
      });
      setSuggestion(null);
    } finally {
      setBusy(false);
    }
  };

  if (!suggestion) return null;
  return (
    <div className="mb-2 rounded-2xl border border-sky-400/20 bg-sky-500/8 p-3">
      <div className="flex items-start gap-2.5">
        <Brain className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200/65">
            Салон помнит
          </p>
          <p className="mt-1 text-sm leading-5 text-white/80">
            Вы говорили: {suggestion.fact}. Учитывать это дальше в текущем сеансе?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide("included")}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
              Да
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide("excluded")}
              className="inline-flex items-center gap-1 rounded-lg bg-white/6 px-3 py-1.5 text-xs text-white/65 disabled:opacity-50"
            >
              <X className="h-3 w-3" aria-hidden /> Нет
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
