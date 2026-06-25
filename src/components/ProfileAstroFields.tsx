"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { formatZodiacLabel, genderLabel, getZodiacFromDate } from "@/utils/zodiac";
import {
  buildAstroMeta,
  LIFE_FOCUS_OPTIONS,
  type AstroMeta,
  type LifeFocus,
} from "@/lib/astro-profile";
import { useSceneImage } from "@/hooks/useSceneImage";
import SceneImage from "@/components/SceneImage";

export interface ProfileAstroValues {
  gender: "male" | "female";
  birthDate: string;
  birthTime: string;
  birthCity: string;
  lifeFocus: LifeFocus;
  mainQuestion: string;
}

interface ProfileAstroFieldsProps {
  values: ProfileAstroValues;
  onChange: (patch: Partial<ProfileAstroValues>) => void;
  compact?: boolean;
  enableSceneArt?: boolean;
}

export default function ProfileAstroFields({
  values,
  onChange,
  compact,
  enableSceneArt = false,
}: ProfileAstroFieldsProps) {
  const zodiac = useMemo(() => {
    if (!values.birthDate) return null;
    return getZodiacFromDate(values.birthDate);
  }, [values.birthDate]);

  const zodiacLabel = zodiac ? formatZodiacLabel(zodiac) : "";
  const { imageUrl: zodiacAvatar, loading: zodiacAvatarLoading } = useSceneImage(
    enableSceneArt && zodiacLabel
      ? { scene: "zodiac_avatar", zodiac: zodiacLabel }
      : null,
    enableSceneArt
  );

  const astroMeta = useMemo(() => {
    if (!values.birthDate) return null;
    return buildAstroMeta(values.birthDate);
  }, [values.birthDate]);

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <p className="font-display text-center text-lg font-semibold text-white">
            Ваш астральный профиль
          </p>
          <p className="mt-1 text-center text-xs text-gray-500">
            Данные нужны для точной расшифровки карт и персональных прогнозов
          </p>
        </div>
      )}

      <div>
        <label className="mb-2 block text-xs text-gray-500">Пол</label>
        <div className="flex gap-3">
          {(["female", "male"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange({ gender: g })}
              className={`flex-1 rounded-xl border px-4 py-2.5 text-sm transition-all ${
                values.gender === g
                  ? "border-aura-purple bg-aura-purple/20 text-aura-neon shadow-neon"
                  : "border-white/10 bg-black/20 text-gray-400 hover:border-white/20"
              }`}
            >
              {g === "female" ? "Женский" : "Мужской"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-gray-500">Дата рождения *</label>
          <input
            type="date"
            required
            value={values.birthDate}
            onChange={(e) => onChange({ birthDate: e.target.value })}
            max={new Date().toISOString().slice(0, 10)}
            min="1900-01-01"
            className="ui-input w-full"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Время рождения</label>
          <input
            type="time"
            value={values.birthTime}
            onChange={(e) => onChange({ birthTime: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
          />
          <p className="mt-1 text-[10px] text-gray-600">Для натальной карты и джйотиш</p>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-500">Город рождения</label>
        <input
          type="text"
          value={values.birthCity}
          onChange={(e) => onChange({ birthCity: e.target.value })}
          placeholder="Москва, Алматы..."
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
        />
      </div>

      {zodiac && astroMeta && (
        <motion.div
          className="rounded-xl border border-aura-emerald/30 bg-aura-emerald/10 px-4 py-4"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          key={`${zodiac.name}-${astroMeta.birthYear}`}
        >
          {(enableSceneArt && (zodiacAvatarLoading || zodiacAvatar)) && (
            <SceneImage
              imageUrl={zodiacAvatar}
              loading={zodiacAvatarLoading}
              label="Дух вашего знака"
              variant="card"
              expandable
              className="mx-auto mb-4 max-w-[140px] border-aura-emerald/20"
            />
          )}
          <p className="text-center text-xs uppercase tracking-widest text-gray-500">
            Рассчитано автоматически
          </p>
          <p className="font-display mt-2 text-center text-2xl font-bold text-aura-emerald">
            {formatZodiacLabel(zodiac)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs text-gray-400 sm:grid-cols-4">
            <div>
              <p className="text-gray-600">Год</p>
              <p className="font-medium text-white">{astroMeta.birthYear}</p>
            </div>
            <div>
              <p className="text-gray-600">Возраст</p>
              <p className="font-medium text-white">{astroMeta.age}</p>
            </div>
            <div>
              <p className="text-gray-600">Китайский</p>
              <p className="font-medium text-white">{astroMeta.chineseZodiac}</p>
            </div>
            <div>
              <p className="text-gray-600">Число пути</p>
              <p className="font-medium text-white">{astroMeta.lifePath}</p>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-gray-500">
            {genderLabel(values.gender)} · стихия {zodiac.element}
          </p>
        </motion.div>
      )}

      <div>
        <label className="mb-2 block text-xs text-gray-500">Что сейчас важнее всего?</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LIFE_FOCUS_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange({ lifeFocus: option.id })}
              className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                values.lifeFocus === option.id
                  ? "border-aura-gold/50 bg-aura-gold/10 text-aura-gold"
                  : "border-white/10 bg-black/20 text-gray-400 hover:border-white/20"
              }`}
            >
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-[10px] opacity-70">{option.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-500">Главный вопрос к картам</label>
        <textarea
          value={values.mainQuestion}
          onChange={(e) => onChange({ mainQuestion: e.target.value })}
          placeholder="Например: стоит ли менять работу этой осенью?"
          rows={2}
          className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder-gray-600"
        />
      </div>
    </div>
  );
}

export function profileAstroToPayload(
  name: string,
  values: ProfileAstroValues
): {
  name: string;
  gender: "male" | "female";
  birthDate: string;
  zodiac: string;
  birthTime?: string;
  birthCity?: string;
  lifeFocus: LifeFocus;
  mainQuestion?: string;
  astroMeta: AstroMeta;
} | null {
  if (!name.trim() || !values.birthDate) return null;
  const birthMs = Date.parse(values.birthDate);
  const now = Date.now();
  if (Number.isNaN(birthMs) || birthMs > now) return null;
  const minBirth = new Date();
  minBirth.setFullYear(minBirth.getFullYear() - 120);
  if (birthMs < minBirth.getTime()) return null;
  const zodiac = getZodiacFromDate(values.birthDate);
  const astroMeta = buildAstroMeta(values.birthDate) ?? undefined;
  if (!astroMeta) return null;

  return {
    name: name.trim(),
    gender: values.gender,
    birthDate: values.birthDate,
    zodiac: formatZodiacLabel(zodiac),
    birthTime: values.birthTime || undefined,
    birthCity: values.birthCity.trim() || undefined,
    lifeFocus: values.lifeFocus,
    mainQuestion: values.mainQuestion.trim() || undefined,
    astroMeta,
  };
}
