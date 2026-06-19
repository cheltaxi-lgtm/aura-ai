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
    const payload = profileAstroToPayload(name, astro);
    if (!payload) return;
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

      <button type="submit" className="btn-neon w-full py-3 text-sm">
        Открыть карты
      </button>
    </motion.form>
  );
}
