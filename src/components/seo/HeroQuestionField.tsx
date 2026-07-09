"use client";

import { type FormEvent, useState } from "react";
import { Sparkles } from "lucide-react";
import { matchSpreadIntentFromQuestion } from "@/lib/spread-intents/match-question";
import { buildAskUrl, buildSpreadStartUrl } from "@/lib/spread-intents/router";
import { useNativeInputSync } from "@/lib/use-native-input-sync";

export function navigateFromQuestion(question: string, master = "veronika"): void {
  const q = question.trim();
  if (!q) return;

  const matched = matchSpreadIntentFromQuestion(q);
  if (matched) {
    window.location.assign(buildSpreadStartUrl(matched, q));
    return;
  }

  window.location.assign(buildAskUrl(q, master, { spread: true }));
}

type HeroQuestionFieldProps = {
  /** Compact row for QuickQuestions block */
  compact?: boolean;
  className?: string;
};

export default function HeroQuestionField({ compact = false, className = "" }: HeroQuestionFieldProps) {
  const [question, setQuestion] = useState("");
  const inputRef = useNativeInputSync<HTMLInputElement>(setQuestion);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = inputRef.current?.value ?? question;
    navigateFromQuestion(value);
  };

  const inputProps = {
    ref: inputRef,
    type: "text" as const,
    value: question,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuestion(e.target.value),
    inputMode: "text" as const,
    autoComplete: "off",
    autoCorrect: "on",
    spellCheck: true,
    enterKeyHint: "go" as const,
    className: "hero-question__input",
    maxLength: 280,
  };

  if (compact) {
    return (
      <form onSubmit={submit} className={`hero-question hero-question--compact ${className}`.trim()}>
        <label htmlFor="hero-question-compact" className="sr-only">
          Ваш вопрос для расклада
        </label>
        <input
          {...inputProps}
          id="hero-question-compact"
          placeholder="Спросите, что хотите узнать…"
        />
        <button
          type="submit"
          className="hero-question__submit hero-question__submit--compact btn-luxe btn-luxe--sm btn-luxe--pill btn-luxe--gold"
        >
          Разложить
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className={`hero-question ${className}`.trim()}>
      <label htmlFor="hero-question" className="hero-question__label">
        Спросите, что хотите узнать
      </label>
      <div className="hero-question__row">
        <input
          {...inputProps}
          id="hero-question"
          placeholder="Например: вернётся ли он? стоит ли менять работу?"
        />
        <button type="submit" className="hero-question__submit btn-luxe btn-luxe--md btn-luxe--gold">
          <Sparkles className="h-4 w-4" aria-hidden />
          Разложить карты
        </button>
      </div>
      <p className="hero-question__hint">
        Подберём схему и мастера — или откроем готовый расклад из каталога
      </p>
    </form>
  );
}
