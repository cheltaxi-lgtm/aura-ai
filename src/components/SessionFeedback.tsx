"use client";

import { useState } from "react";

interface SessionFeedbackProps {
  characterId: string;
  visible: boolean;
}

export default function SessionFeedback({ characterId, visible }: SessionFeedbackProps) {
  const [rated, setRated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!visible || rated) return null;

  const submit = async (rating: number) => {
    setSubmitting(true);
    try {
      await fetch("/api/memory/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, outcomeRating: rating }),
      });
      setRated(true);
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-center">
      <p className="mb-2 text-xs text-gray-400">Насколько откликнулся последний сеанс?</p>
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={submitting}
            onClick={() => void submit(n)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-sm text-aura-gold transition-colors hover:border-aura-gold/50 hover:bg-aura-gold/20 disabled:opacity-40"
            aria-label={`Оценка ${n} из 5`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
