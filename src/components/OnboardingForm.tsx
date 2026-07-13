"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import ProfileAstroFields, {
  profileAstroToPayload,
  type ProfileAstroValues,
} from "@/components/ProfileAstroFields";
import type { AstroMeta, LifeFocus } from "@/lib/astro-profile";
import { MIN_DISPLAY_NAME_LENGTH } from "@/lib/auth-policy";
import { trackOnboardingStarted } from "@/lib/seo/metrika";

export interface OnboardingData {
  name: string;
  gender: "male" | "female";
  birthDate: string;
  zodiac: string;
  birthTime?: string;
  birthCity?: string;
  lifeFocus?: LifeFocus;
  mainQuestion?: string;
  astroMeta?: AstroMeta;
}

interface OnboardingFormProps {
  initialName?: string;
  initialGender?: "male" | "female";
  onComplete: (data: OnboardingData) => Promise<void>;
}

export default function OnboardingForm({
  initialName = "",
  initialGender = "female",
  onComplete,
}: OnboardingFormProps) {
  const accountName = initialName.trim();
  const nameLocked = accountName.length >= MIN_DISPLAY_NAME_LENGTH;
  const [name, setName] = useState(accountName);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [astro, setAstro] = useState<ProfileAstroValues>({
    gender: initialGender,
    birthDate: "",
    birthTime: "",
    birthCity: "",
    lifeFocus: "general",
    mainQuestion: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      setShowWelcome(true);
      trackOnboardingStarted();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const effectiveName = nameLocked ? accountName : name;
    const payload = profileAstroToPayload(effectiveName, astro);
    if (!payload) {
      setFormError("Укажите имя и корректную дату рождения.");
      return;
    }
    setSubmitting(true);
    try {
      await onComplete(payload);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось сохранить профиль.");
      setSubmitting(false);
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="flow-panel mx-auto max-w-lg space-y-5"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h2 className="font-display text-center text-xl font-semibold text-white">
        Один шаг до старта
      </h2>

      {showWelcome ? (
        <div className="rounded-xl border border-aura-gold/25 bg-aura-gold/10 px-4 py-4 text-center">
          <p className="text-sm font-medium text-aura-champagne">Аккаунт создан</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            Остался один шаг — дата рождения для персонализации. После сохранения начислим стартовые
            руны и откроем ваш расклад.
          </p>
        </div>
      ) : null}

      <p className="text-center text-sm text-gray-400">
        Аккаунт уже создан. Укажите дату рождения — мы рассчитаем знак зодиака, откроем кабинет и
        начислим стартовые руны на расклады.
      </p>

      {nameLocked ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-sm text-gray-300">
          {accountName}, добро пожаловать
        </p>
      ) : (
        <div>
          <label htmlFor="onboarding-name" className="mb-1 block text-xs text-gray-500">
            Имя *
          </label>
          <input
            id="onboarding-name"
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Как к вам обращаться?"
            className="ui-input w-full"
          />
        </div>
      )}

      <ProfileAstroFields
        compact
        enableSceneArt
        values={astro}
        onChange={(patch) => setAstro((prev) => ({ ...prev, ...patch }))}
      />

      {formError && (
        <p role="alert" className="text-center text-sm text-red-400">
          {formError}
        </p>
      )}

      <button type="submit" disabled={submitting} className="btn-neon w-full py-3 text-sm">
        {submitting ? "Сохраняем…" : "Продолжить"}
      </button>
    </motion.form>
  );
}
