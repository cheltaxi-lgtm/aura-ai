"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { matchSpreadIntentFromQuestion } from "@/lib/spread-intents/match-question";
import { buildAskUrl, buildSpreadStartUrl } from "@/lib/spread-intents/router";
import { useNativeInputSync } from "@/lib/use-native-input-sync";
import { LANDING_QUESTION_KEY } from "@/lib/landing-offer";
import { trackHeroQuestionStarted, trackHeroQuestionSubmitted } from "@/lib/seo/metrika";

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
  /** Landing guest flow: keep the user in-page and start the preview spread. */
  onQuestionSubmit?: (question: string) => void;
  /** Desktop-only autofocus (never on mobile). */
  autoFocusDesktop?: boolean;
  /** Button style for the submit control. */
  submitVariant?: "gold" | "secondary";
  placeholder?: string;
  hint?: string;
  /** Readable hint over photographic hero backgrounds. */
  hintOnScrim?: boolean;
};

export default function HeroQuestionField({
  compact = false,
  className = "",
  onQuestionSubmit,
  autoFocusDesktop = false,
  submitVariant = "gold",
  placeholder = "Например: вернётся ли он?",
  hint = "Подберём схему и мастера — или откроем готовый расклад из каталога",
  hintOnScrim = false,
}: HeroQuestionFieldProps) {
  const [question, setQuestion] = useState("");
  const inputRef = useNativeInputSync<HTMLInputElement>(setQuestion);

  useEffect(() => {
    if (!autoFocusDesktop || compact) return;
    if (typeof window === "undefined") return;
    const isDesktop = window.matchMedia("(min-width: 768px) and (pointer: fine)").matches;
    if (!isDesktop) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus once on mount when enabled
  }, [autoFocusDesktop, compact]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = (inputRef.current?.value ?? question).trim();
    if (!value) return;

    if (typeof window !== "undefined") {
      sessionStorage.setItem(LANDING_QUESTION_KEY, value);
    }

    trackHeroQuestionSubmitted(compact ? "quick_questions" : "hero");

    if (onQuestionSubmit) {
      onQuestionSubmit(value);
      return;
    }

    const matched = matchSpreadIntentFromQuestion(value);
    if (matched) {
      window.location.assign(buildSpreadStartUrl(matched, value));
      return;
    }

    window.location.assign(buildAskUrl(value, "veronika", { spread: true }));
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
    onFocus: () => trackHeroQuestionStarted(),
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

  const submitClass =
    submitVariant === "secondary"
      ? "hero-question__submit editorial-btn editorial-btn--outline"
      : "hero-question__submit btn-luxe btn-luxe--md btn-luxe--gold";

  return (
    <form
      onSubmit={submit}
      className={`hero-question hero-question--landing ${hintOnScrim ? "hero-question--hint-scrim" : ""} ${className}`.trim()}
    >
      <label htmlFor="hero-question" className="hero-question__label">
        Спросите, что хотите узнать
      </label>
      <div className="hero-question__row">
        <input {...inputProps} id="hero-question" placeholder={placeholder} />
        <button type="submit" className={submitClass}>
          <Sparkles className="h-4 w-4" aria-hidden />
          Разложить карты
        </button>
      </div>
      <p className="hero-question__hint">{hint}</p>
    </form>
  );
}
