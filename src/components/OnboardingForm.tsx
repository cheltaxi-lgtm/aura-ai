"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import ProfileAstroFields, {
  profileAstroToPayload,
  type ProfileAstroValues,
} from "@/components/ProfileAstroFields";
import type { AstroMeta, LifeFocus } from "@/lib/astro-profile";

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
  onComplete: (data: OnboardingData) => void;
}

export default function OnboardingForm({ initialName = "", onComplete }: OnboardingFormProps) {
  const [name, setName] = useState(initialName);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [astro, setAstro] = useState<ProfileAstroValues>({
    gender: "female",
    birthDate: "",
    birthTime: "",
    birthCity: "",
    lifeFocus: "general",
    mainQuestion: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const payload = profileAstroToPayload(name, astro);
    if (!payload) {
      setFormError("Укажите имя и корректную дату рождения.");
      return;
    }
    setSubmitting(true);
    onComplete(payload);
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
        Раскрой свой астральный код
      </h2>

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
        {submitting ? "Сохраняем…" : "Открыть карты"}
      </button>
    </motion.form>
  );
}
