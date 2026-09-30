"use client";

import { useEffect, useState } from "react";

interface SessionFeedbackProps {
  sessionId?: string | null;
  visible: boolean;
  targetType?: "session" | "reading";
  product?: string;
}

const REASONS = [
  ["too_general", "Слишком общо"],
  ["cards_wrong", "Карты распознаны неверно"],
  ["did_not_answer", "Не ответило на вопрос"],
  ["too_long", "Слишком длинно"],
  ["technical", "Техническая проблема"],
  ["other", "Другая причина"],
] as const;

export default function SessionFeedback({ sessionId, visible, targetType = "session", product = "tarot" }: SessionFeedbackProps) {
  const [rated, setRated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [negative, setNegative] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRated(false);
    setSubmitting(false);
    setNegative(false);
    setError("");
  }, [sessionId, targetType]);

  if (!visible || rated || !sessionId) return null;

  const submit = async (useful: boolean, reason?: string) => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/feedback/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId: sessionId, useful, reason, product }),
      });
      if (!response.ok) throw new Error("feedback_failed");
      setRated(true);
    } catch {
      setError("Не удалось отправить ответ. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-center">
      <p className="mb-2 text-xs text-gray-300">Этот разбор был полезен?</p>
      {!negative ? <div className="flex justify-center gap-2">
        <button type="button" disabled={submitting} onClick={() => void submit(true)} className="min-h-11 rounded-lg border border-emerald-400/30 px-4 text-sm text-emerald-200 hover:bg-emerald-400/10">Да</button>
        <button type="button" disabled={submitting} onClick={() => setNegative(true)} className="min-h-11 rounded-lg border border-white/15 px-4 text-sm text-gray-200 hover:bg-white/5">Нет</button>
      </div> : <div className="flex flex-wrap justify-center gap-2">
        {REASONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={submitting}
            onClick={() => void submit(false, value)}
            className="min-h-11 rounded-lg border border-white/10 px-3 text-xs text-gray-300 hover:border-aura-gold/40 disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>}
      {error ? <p className="mt-2 text-xs text-red-200" role="status">{error}</p> : null}
    </div>
  );
}
