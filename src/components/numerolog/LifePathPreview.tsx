"use client";

import { useState, type FormEvent } from "react";
import { lifePathNumber } from "@/lib/numerology/calculator";
import { trackSeoEvent } from "@/lib/seo/metrika";

/**
 * Public life-path calculator. Date stays in component state only —
 * no receipt, no browser persistence, no free-reading mint.
 */
export default function LifePathPreview() {
  const [raw, setRaw] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const result = submitted ? lifePathNumber(raw) : null;
  const ok = Boolean(result && result.number > 0);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const next = lifePathNumber(raw);
    if (next.number > 0) {
      trackSeoEvent("life_path_calc_complete", { number: next.number });
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="life-path-date" className="block text-sm text-white/70">
          Дата рождения
        </label>
        <input
          id="life-path-date"
          type="date"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setSubmitted(false);
          }}
          className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-aura-gold/50"
          required
        />
        <button type="submit" className="btn-luxe btn-luxe--md btn-luxe--gold inline-flex">
          Рассчитать число пути
        </button>
      </form>

      {submitted && !ok ? (
        <p className="mt-4 text-sm text-white/60">
          Не удалось прочитать дату. Укажите день, месяц и год рождения.
        </p>
      ) : null}

      {ok && result ? (
        <div className="mt-5 space-y-2">
          <p className="text-sm text-aura-gold/80">Число жизненного пути</p>
          <p className="font-display text-4xl font-bold text-white">{result.number}</p>
          <p className="font-medium text-white">
            {result.title}
            {result.isMaster ? " · мастер-число" : ""}
          </p>
          <p className="text-sm text-white/70">{result.meaning}</p>
          {result.keywords.length > 0 ? (
            <p className="text-xs text-white/45">Ключи: {result.keywords.join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
