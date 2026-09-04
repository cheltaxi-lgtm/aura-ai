"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { matchSpreadIntentFromQuestion } from "@/lib/spread-intents/match-question";
import { buildAskUrl, buildSpreadStartUrl } from "@/lib/spread-intents/router";
import { useNativeInputSync } from "@/lib/use-native-input-sync";
import { HOME_CUSTOM_QUESTION_EVENT, LANDING_QUESTION_KEY } from "@/lib/landing-offer";
import { trackHeroQuestionStarted, trackHeroQuestionSubmitted } from "@/lib/seo/metrika";

function dispatchHomeCustomQuestion(question: string, master = "veronika"): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  if (path !== "/" && path !== "") return false;
  window.dispatchEvent(
    new CustomEvent(HOME_CUSTOM_QUESTION_EVENT, { detail: { question, master } })
  );
  return true;
}

export function navigateFromQuestion(question: string, master = "veronika"): void {
  const q = question.trim();
  if (!q) return;

  if (dispatchHomeCustomQuestion(q, master)) return;

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
  inputId?: string;
  label?: string;
  submitLabel?: string;
  analyticsSource?: string;
  /** Multi-line field (catalog ask panel). Hero/compact stay single-line. */
  multiline?: boolean;
  rows?: number;
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
  inputId,
  label,
  submitLabel,
  analyticsSource,
  multiline = false,
  rows = 5,
}: HeroQuestionFieldProps) {
  const [question, setQuestion] = useState("");
  const inputRef = useNativeInputSync<HTMLInputElement | HTMLTextAreaElement>(setQuestion);
  const fieldId = inputId ?? (compact ? "hero-question-compact" : "hero-question");
  const fieldLabel = label ?? (compact ? "Ваш вопрос для расклада" : "Спросите, что хотите узнать");
  const buttonText = submitLabel ?? (compact ? "Разложить" : "Разложить карты");

  useEffect(() => {
    inputRef.current?.setCustomValidity("");
  }, [question, inputRef]);

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
    if (!value) {
      inputRef.current?.setCustomValidity("Напишите вопрос, чтобы начать разбор.");
      inputRef.current?.reportValidity();
      inputRef.current?.focus();
      return;
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem(LANDING_QUESTION_KEY, value);
    }

    trackHeroQuestionSubmitted(
      analyticsSource ?? (compact ? "quick_questions" : "hero")
    );

    if (onQuestionSubmit) {
      onQuestionSubmit(value);
      return;
    }

    if (dispatchHomeCustomQuestion(value)) return;

    const matched = matchSpreadIntentFromQuestion(value);
    if (matched) {
      window.location.assign(buildSpreadStartUrl(matched, value));
      return;
    }

    window.location.assign(buildAskUrl(value, "veronika", { spread: true }));
  };

  const fieldProps = {
    ref: inputRef,
    value: question,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.target.setCustomValidity("");
      setQuestion(e.target.value);
    },
    required: true,
    autoComplete: "off",
    autoCorrect: "on" as const,
    spellCheck: true,
    className: "hero-question__input",
    maxLength: 280,
    onFocus: () => trackHeroQuestionStarted(),
  };

  if (compact) {
    return (
      <form onSubmit={submit} className={`hero-question hero-question--compact ${className}`.trim()}>
        <label htmlFor={fieldId} className="sr-only">
          {fieldLabel}
        </label>
        <input
          {...fieldProps}
          type="text"
          inputMode="text"
          enterKeyHint="go"
          id={fieldId}
          placeholder="Спросите, что хотите узнать…"
        />
        <button
          type="submit"
          className="hero-question__submit hero-question__submit--compact btn-luxe btn-luxe--sm btn-luxe--pill btn-luxe--gold"
        >
          {buttonText}
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
      className={`hero-question hero-question--landing${multiline ? " hero-question--multiline" : ""}${hintOnScrim ? " hero-question--hint-scrim" : ""} ${className}`.trim()}
    >
      <label htmlFor={fieldId} className="hero-question__label">
        {fieldLabel}
      </label>
      <div className="hero-question__row">
        {multiline ? (
          <textarea
            {...fieldProps}
            id={fieldId}
            placeholder={placeholder}
            rows={rows}
          />
        ) : (
          <input
            {...fieldProps}
            type="text"
            inputMode="text"
            enterKeyHint="go"
            id={fieldId}
            placeholder={placeholder}
          />
        )}
        <button type="submit" className={submitClass}>
          <Sparkles className="h-4 w-4" aria-hidden />
          {buttonText}
        </button>
      </div>
      {hint ? <p className="hero-question__hint">{hint}</p> : null}
    </form>
  );
}
