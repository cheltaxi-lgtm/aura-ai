"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  formatZodiacLabel,
  genderLabel,
  getZodiacFromDate,
  zodiacSignArtUrl,
} from "@/utils/zodiac";
import {
  buildAstroMeta,
  LIFE_FOCUS_OPTIONS,
  type AstroMeta,
  type LifeFocus,
} from "@/lib/astro-profile";
import SceneImage from "@/components/SceneImage";

export interface ProfileAstroValues {
  gender: "male" | "female";
  birthDate: string;
  birthTime: string;
  birthTimeUnknown: boolean;
  birthCity: string;
  lifeFocus: LifeFocus;
  mainQuestion: string;
}

interface ProfileAstroFieldsProps {
  values: ProfileAstroValues;
  onChange: (patch: Partial<ProfileAstroValues>) => void;
  compact?: boolean;
  enableSceneArt?: boolean;
  enableCitySearch?: boolean;
}

export default function ProfileAstroFields({
  values,
  onChange,
  compact,
  enableSceneArt = false,
  enableCitySearch = false,
}: ProfileAstroFieldsProps) {
  const [citySuggestions, setCitySuggestions] = useState<
    Array<{ label: string; latitude: number; longitude: number; timezone: string }>
  >([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [highlightedCityIndex, setHighlightedCityIndex] = useState(-1);
  const [selectedCityLabel, setSelectedCityLabel] = useState<string | null>(null);
  const cityInputId = useId();
  const cityListboxId = `${cityInputId}-listbox`;
  const cityListOpen = enableCitySearch && citySuggestions.length > 0;

  const selectCity = (label: string) => {
    setSelectedCityLabel(label);
    onChange({ birthCity: label });
    setCitySuggestions([]);
    setHighlightedCityIndex(-1);
  };

  useEffect(() => {
    if (
      !enableCitySearch ||
      values.birthCity.trim().length < 2 ||
      values.birthCity === selectedCityLabel
    ) {
      setCitySuggestions([]);
      setHighlightedCityIndex(-1);
      setCityLoading(false);
      return;
    }
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setCityLoading(true);
      void fetch(`/api/natal-chart/places?q=${encodeURIComponent(values.birthCity.trim())}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data: { places?: typeof citySuggestions }) => {
          setCitySuggestions(data.places ?? []);
          setHighlightedCityIndex(-1);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setCitySuggestions([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setCityLoading(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
  }, [enableCitySearch, selectedCityLabel, values.birthCity]);
  const zodiac = useMemo(() => {
    if (!values.birthDate) return null;
    return getZodiacFromDate(values.birthDate);
  }, [values.birthDate]);

  const zodiacAvatar = enableSceneArt && zodiac ? zodiacSignArtUrl(zodiac) : null;

  const astroMeta = useMemo(() => {
    if (!values.birthDate) return null;
    return buildAstroMeta(values.birthDate);
  }, [values.birthDate]);

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <p className="font-display text-center text-lg font-semibold text-white">
            Ваш профиль для расчётов
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
            disabled={values.birthTimeUnknown}
            onChange={(e) => onChange({ birthTime: e.target.value, birthTimeUnknown: false })}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white disabled:opacity-40"
          />
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={values.birthTimeUnknown}
              onChange={(e) =>
                onChange({
                  birthTimeUnknown: e.target.checked,
                  birthTime: e.target.checked ? "" : values.birthTime,
                })
              }
              className="rounded border-white/20"
            />
            Время рождения неизвестно
          </label>
          <p className="mt-1 text-[10px] text-gray-600">Для натальной карты и джйотиш</p>
        </div>
      </div>

      <div className="relative">
        <label htmlFor={cityInputId} className="mb-1 block text-xs text-gray-500">
          Город рождения
        </label>
        <input
          id={cityInputId}
          type="text"
          value={values.birthCity}
          onChange={(e) => {
            setSelectedCityLabel(null);
            setHighlightedCityIndex(-1);
            onChange({ birthCity: e.target.value });
          }}
          onKeyDown={(e) => {
            if (!enableCitySearch) return;
            if (e.key === "ArrowDown" && citySuggestions.length > 0) {
              e.preventDefault();
              setHighlightedCityIndex((current) =>
                current < citySuggestions.length - 1 ? current + 1 : 0
              );
            } else if (e.key === "ArrowUp" && citySuggestions.length > 0) {
              e.preventDefault();
              setHighlightedCityIndex((current) =>
                current > 0 ? current - 1 : citySuggestions.length - 1
              );
            } else if (
              e.key === "Enter" &&
              highlightedCityIndex >= 0 &&
              citySuggestions[highlightedCityIndex]
            ) {
              e.preventDefault();
              selectCity(citySuggestions[highlightedCityIndex].label);
            } else if (e.key === "Escape" && cityListOpen) {
              e.preventDefault();
              setCitySuggestions([]);
              setHighlightedCityIndex(-1);
            }
          }}
          placeholder="Москва, Алматы..."
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
          autoComplete="off"
          role={enableCitySearch ? "combobox" : undefined}
          aria-autocomplete={enableCitySearch ? "list" : undefined}
          aria-expanded={enableCitySearch ? cityListOpen : undefined}
          aria-controls={enableCitySearch ? cityListboxId : undefined}
          aria-activedescendant={
            cityListOpen && highlightedCityIndex >= 0
              ? `${cityListboxId}-option-${highlightedCityIndex}`
              : undefined
          }
        />
        {cityListOpen ? (
          <ul
            id={cityListboxId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-xl border border-white/10 bg-[#121018] py-1 shadow-lg"
          >
            {citySuggestions.map((place, index) => (
              <li
                id={`${cityListboxId}-option-${index}`}
                key={`${place.label}-${place.latitude}-${place.longitude}`}
                role="option"
                aria-selected={highlightedCityIndex === index}
                className={`cursor-pointer px-3 py-2 text-left text-xs text-white/80 ${
                  highlightedCityIndex === index ? "bg-white/10" : "hover:bg-white/5"
                }`}
                onMouseEnter={() => setHighlightedCityIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectCity(place.label)}
              >
                {place.label}
              </li>
            ))}
          </ul>
        ) : null}
        {enableCitySearch && cityLoading ? (
          <p className="mt-1 text-[10px] text-gray-600">Поиск города…</p>
        ) : null}
      </div>

      {zodiac && astroMeta && (
        <motion.div
          className="rounded-xl border border-aura-emerald/30 bg-aura-emerald/10 px-4 py-4"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          key={`${zodiac.name}-${astroMeta.birthYear}`}
        >
          {zodiacAvatar ? (
            <SceneImage
              imageUrl={zodiacAvatar}
              label="Дух вашего знака"
              variant="card"
              expandable
              className="mx-auto mb-4 max-w-[140px] border-aura-emerald/20"
            />
          ) : null}
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
    birthTime: values.birthTimeUnknown ? undefined : values.birthTime || undefined,
    birthCity: values.birthCity.trim() || undefined,
    lifeFocus: values.lifeFocus,
    mainQuestion: values.mainQuestion.trim() || undefined,
    astroMeta,
  };
}
