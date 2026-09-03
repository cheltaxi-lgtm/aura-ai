"use client";

import { useState, type FormEvent } from "react";
import { lifePathNumber, personalYear, soulNumber } from "@/lib/numerology/calculator";
import type { NumerologyResult } from "@/lib/numerology/constants";
import { trackSeoEvent } from "@/lib/seo/metrika";

type CalcMode = "life-path" | "personal-year" | "soul" | "bundle";

/**
 * Public numerology preview. Inputs stay in React state only —
 * no receipt, no browser persistence, no free-reading mint.
 */
export default function NumerologyPublicCalc({
  mode,
  goal,
  submitLabel,
}: {
  mode: CalcMode;
  goal: string;
  submitLabel: string;
}) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const needsDate = mode !== "soul";
  const needsName = mode === "soul";

  const life = submitted && needsDate ? lifePathNumber(date) : null;
  const year = submitted && (mode === "personal-year" || mode === "bundle") ? personalYear(date) : null;
  const soul = submitted && needsName ? soulNumber(name) : null;

  const ok =
    mode === "soul"
      ? Boolean(soul && soul.number > 0)
      : mode === "bundle"
        ? Boolean(life && life.number > 0 && year && year.number > 0)
        : mode === "personal-year"
          ? Boolean(year && year.number > 0)
          : Boolean(life && life.number > 0);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (mode === "soul") {
      const next = soulNumber(name);
      if (next.number > 0) trackSeoEvent(goal, { number: next.number });
      return;
    }
    if (mode === "personal-year") {
      const next = personalYear(date);
      if (next.number > 0) trackSeoEvent(goal, { number: next.number });
      return;
    }
    if (mode === "bundle") {
      const lifeNext = lifePathNumber(date);
      const yearNext = personalYear(date);
      if (lifeNext.number > 0 && yearNext.number > 0) {
        trackSeoEvent(goal, { number: lifeNext.number, year: yearNext.number });
      }
      return;
    }
    const next = lifePathNumber(date);
    if (next.number > 0) trackSeoEvent(goal, { number: next.number });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <form onSubmit={onSubmit} className="space-y-3">
        {needsDate ? (
          <>
            <label htmlFor={`num-calc-date-${mode}`} className="block text-sm text-white/70">
              Дата рождения
            </label>
            <input
              id={`num-calc-date-${mode}`}
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSubmitted(false);
              }}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-aura-gold/50"
              required
            />
          </>
        ) : null}
        {needsName ? (
          <>
            <label htmlFor={`num-calc-name-${mode}`} className="block text-sm text-white/70">
              Имя (как пишете обычно)
            </label>
            <input
              id={`num-calc-name-${mode}`}
              type="text"
              autoComplete="given-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSubmitted(false);
              }}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white outline-none focus:border-aura-gold/50"
              required
              minLength={2}
            />
          </>
        ) : null}
        <button type="submit" className="btn-luxe btn-luxe--md btn-luxe--gold inline-flex">
          {submitLabel}
        </button>
      </form>

      {submitted && !ok ? (
        <p className="mt-4 text-sm text-white/60">
          {needsName
            ? "Не удалось прочитать имя. Укажите буквы имени — без цифр."
            : "Не удалось прочитать дату. Укажите день, месяц и год рождения."}
        </p>
      ) : null}

      {ok && mode === "bundle" && life && year ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <ResultBlock kicker="Число жизненного пути" result={life} />
          <ResultBlock kicker={`Личный год ${new Date().getFullYear()}`} result={year} />
        </div>
      ) : null}
      {ok && mode === "life-path" && life ? (
        <ResultBlock kicker="Число жизненного пути" result={life} />
      ) : null}
      {ok && mode === "personal-year" && year ? (
        <ResultBlock kicker={`Личный год ${new Date().getFullYear()}`} result={year} />
      ) : null}
      {ok && mode === "soul" && soul ? <ResultBlock kicker="Число души" result={soul} /> : null}
    </div>
  );
}

function ResultBlock({ kicker, result }: { kicker: string; result: NumerologyResult }) {
  return (
    <div className="mt-5 space-y-2">
      <p className="text-sm text-aura-gold/80">{kicker}</p>
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
  );
}
