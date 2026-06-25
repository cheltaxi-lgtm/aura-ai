"use client";

import { useState } from "react";
import { getCharacterById } from "@/lib/characters";

interface Props {
  ritualId: string;
  characterKey: string;
  onComplete: () => void;
  onSkip: () => void;
}

export default function RitualReview({
  ritualId,
  characterKey,
  onComplete,
  onSkip,
}: Props) {
  const [step, setStep] = useState<"ask" | "form">("ask");
  const [outcomeText, setOutcomeText] = useState("");
  const [rating, setRating] = useState(0);
  const [sharePublicly, setSharePublicly] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const master = getCharacterById(characterKey);
  const masterName = master?.name ?? "Мастер";

  const submit = async () => {
    if (rating < 1 || submitting) return;
    setSubmitting(true);
    try {
      await fetch(`/api/ritual/${ritualId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcomeText, outcomeRating: rating, sharePublicly }),
      });
      onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "ask") {
    return (
      <div className="px-5 py-8 text-center">
        <p className="font-display text-lg text-white">
          {masterName} ждёт. Прошло 7 дней.
        </p>
        <p className="mt-2 text-sm text-white/60">
          Были знаки которые он называл?
        </p>
        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => setStep("form")}
            className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block"
          >
            Да, были знаки
          </button>
          <button
            type="button"
            onClick={() => {
              setRating(2);
              setStep("form");
            }}
            className="btn-luxe btn-luxe--md btn-luxe--block border border-white/10 bg-white/5"
          >
            Нет, пока тихо
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-white/40 underline"
          >
            Ещё рано
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-6">
      <textarea
        value={outcomeText}
        onChange={(e) => setOutcomeText(e.target.value)}
        placeholder="Что произошло? (необязательно)"
        rows={4}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400/50 focus:outline-none"
      />

      <div className="mt-4 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            className={`text-2xl transition ${
              star <= rating ? "text-amber-400" : "text-white/20"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-white/60">
        <input
          type="checkbox"
          checked={sharePublicly}
          onChange={(e) => setSharePublicly(e.target.checked)}
          className="rounded"
        />
        Поделиться анонимно с другими
      </label>

      <button
        type="button"
        disabled={rating < 1 || submitting}
        onClick={() => void submit()}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block mt-6"
      >
        {submitting ? "Отправка…" : "Отправить"}
      </button>
    </div>
  );
}
