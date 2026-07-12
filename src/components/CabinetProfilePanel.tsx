"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Save, UserRound, X } from "lucide-react";
import ProfileAstroFields, {
  profileAstroToPayload,
  type ProfileAstroValues,
} from "@/components/ProfileAstroFields";
import { formatZodiacLabel, genderLabel, getZodiacFromDate } from "@/utils/zodiac";
import { lifeFocusLabel, type AstroMeta, type LifeFocus } from "@/lib/astro-profile";
import { clearNeedsServerProfile } from "@/lib/home-flow-storage";

export interface CabinetProfile {
  id: string;
  name: string;
  gender: "male" | "female";
  birthDate: string;
  zodiac: string;
  birthTime: string | null;
  birthCity: string | null;
  lifeFocus: LifeFocus | null;
  mainQuestion: string | null;
  astroMeta: AstroMeta | Record<string, unknown> | null;
}

interface CabinetProfilePanelProps {
  email: string;
  accountName: string;
  profile: CabinetProfile | null;
  onSaved: (profile: CabinetProfile) => void;
}

const EMPTY_ASTRO: ProfileAstroValues = {
  gender: "female",
  birthDate: "",
  birthTime: "",
  birthCity: "",
  lifeFocus: "general",
  mainQuestion: "",
};

function profileToForm(profile: CabinetProfile | null, fallbackName: string): {
  name: string;
  astro: ProfileAstroValues;
} {
  return {
    name: profile?.name ?? fallbackName,
    astro: {
      gender: profile?.gender ?? "female",
      birthDate: profile?.birthDate ?? "",
      birthTime: profile?.birthTime ?? "",
      birthCity: profile?.birthCity ?? "",
      lifeFocus: (profile?.lifeFocus ?? "general") as LifeFocus,
      mainQuestion: profile?.mainQuestion ?? "",
    },
  };
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-600">{label}</p>
      <p className="mt-0.5 text-sm text-white">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

export default function CabinetProfilePanel({
  email,
  accountName,
  profile,
  onSaved,
}: CabinetProfilePanelProps) {
  const [editing, setEditing] = useState(!profile?.birthDate);
  const [name, setName] = useState(profile?.name ?? accountName);
  const [astro, setAstro] = useState<ProfileAstroValues>(() => profileToForm(profile, "").astro);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const meta = profile?.astroMeta as AstroMeta | undefined;
  const zodiacSign = profile?.birthDate ? getZodiacFromDate(profile.birthDate) : null;

  const missingFields = [
    !profile?.birthDate && "дата рождения",
    !profile?.birthTime && "время рождения",
    !profile?.birthCity && "город рождения",
    !profile?.mainQuestion && "главный вопрос",
  ].filter(Boolean) as string[];

  const startEdit = () => {
    const form = profileToForm(profile, name);
    setName(form.name);
    setAstro(form.astro);
    setError("");
    setSuccess("");
    setEditing(true);
  };

  const cancelEdit = () => {
    const form = profileToForm(profile, name);
    setName(form.name);
    setAstro(form.astro);
    setEditing(false);
    setError("");
  };

  const handleSave = async () => {
    setError("");
    setSuccess("");
    const payload = profileAstroToPayload(name, astro);
    if (!payload) {
      setError("Укажите имя и дату рождения");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось сохранить");
        return;
      }

      if (data.profile) {
        onSaved(data.profile as CabinetProfile);
        clearNeedsServerProfile();
        localStorage.setItem(
          "aura_profile",
          JSON.stringify({
            name: data.profile.name,
            gender: data.profile.gender,
            birthDate: data.profile.birthDate,
            zodiac: data.profile.zodiac,
            birthTime: data.profile.birthTime ?? undefined,
            birthCity: data.profile.birthCity ?? undefined,
            lifeFocus: data.profile.lifeFocus ?? undefined,
            mainQuestion: data.profile.mainQuestion ?? undefined,
            astroMeta: data.profile.astroMeta ?? undefined,
            tarotCards: [],
          })
        );
      }

      setSuccess("Профиль сохранён — прогнозы станут точнее");
      setEditing(false);
    } catch {
      setError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display flex items-center gap-2 text-xl text-gray-300">
          <UserRound className="h-5 w-5" /> Мой профиль
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-400 transition-colors hover:border-aura-purple/40 hover:text-aura-neon"
          >
            <Pencil className="h-3.5 w-3.5" />
            {profile?.birthDate ? "Изменить данные" : "Заполнить профиль"}
          </button>
        )}
      </div>

      {missingFields.length > 0 && !editing && (
        <div className="mb-4 rounded-xl border border-aura-gold/30 bg-aura-gold/10 px-4 py-3 text-sm text-aura-gold">
          Для более точного анализа добавьте: {missingFields.join(", ")}.
        </div>
      )}

      {editing ? (
        <motion.div
          className="glass-panel p-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-4">
            <label className="mb-1 block text-xs text-gray-500">Имя</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
            <p className="mt-1 text-[10px] text-gray-600">{email}</p>
          </div>

          <ProfileAstroFields
            values={astro}
            onChange={(patch) => setAstro((prev) => ({ ...prev, ...patch }))}
          />

          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn-neon flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
            {profile?.birthDate && (
              <button
                type="button"
                onClick={cancelEdit}
                className="flex items-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4" /> Отмена
              </button>
            )}
          </div>
        </motion.div>
      ) : profile?.birthDate ? (
        <div className="glass-panel p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-2xl font-bold text-white">{profile.name}</p>
              <p className="text-sm text-gray-500">{email}</p>
            </div>
            {zodiacSign && (
              <div className="rounded-xl border border-aura-emerald/30 bg-aura-emerald/10 px-4 py-3 text-center">
                <p className="text-xs text-gray-500">Знак зодиака</p>
                <p className="font-display text-lg font-semibold text-aura-emerald">
                  {formatZodiacLabel(zodiacSign)}
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Пол" value={genderLabel(profile.gender)} />
            <Field label="Дата рождения" value={profile.birthDate} />
            <Field label="Время рождения" value={profile.birthTime} />
            <Field label="Город рождения" value={profile.birthCity} />
            <Field label="Фокус запроса" value={lifeFocusLabel(profile.lifeFocus ?? undefined)} />
            <Field label="Главный вопрос" value={profile.mainQuestion} />
          </div>

          {meta && (
            <div className="mt-6 grid grid-cols-2 gap-3 rounded-xl border border-white/5 bg-black/20 p-4 sm:grid-cols-4">
              <Field label="Год рождения" value={String(meta.birthYear)} />
              <Field label="Возраст" value={String(meta.age)} />
              <Field label="Китайский знак" value={meta.chineseZodiac} />
              <Field label="Число пути" value={String(meta.lifePath)} />
            </div>
          )}

          {success && <p className="mt-4 text-sm text-aura-emerald">{success}</p>}
        </div>
      ) : (
        <div className="glass-panel p-6 text-sm text-gray-400">
          Профиль не заполнен — нажмите «Заполнить профиль», чтобы получать точные расклады.
        </div>
      )}
    </section>
  );
}
