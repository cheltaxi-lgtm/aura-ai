"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import DestinyMatrixGrid, {
  DESTINY_MATRIX_UI_SLOT_COUNT,
} from "@/components/numerolog/DestinyMatrixGrid";
import { buildMatrixFreeSummary, type MatrixFreeSummary } from "@/lib/numerology/matrix-free-summary";
import { parseBirthDate } from "@/lib/numerology/constants";
import { readStoredProfile } from "@/lib/home-flow-storage";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { useAuth } from "@/lib/useAuth";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { PRICING } from "@/lib/config/pricing";

const FULL_HREF = "/?numerolog=1&tool=destiny_matrix";

const LOCKED_SECTIONS = [
  "Полный разбор предназначения",
  "Денежный канал и блоки",
  "Отношения и сценарии близости",
  "Кармический хвост",
  "Родовые программы отца и матери",
  "Практика на 30 дней и AI-вопросы",
] as const;

/** Normalize profile birth dates (ISO / dotted) for `<input type="date">`. */
function toDateInputValue(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const trimmed = raw.trim();
  const isoHead = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoHead && parseBirthDate(isoHead[1])) return isoHead[1];
  const parsed = parseBirthDate(trimmed);
  if (!parsed) return "";
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

export default function DestinyMatrixPreview() {
  const { isLoggedIn, user, loading: authLoading } = useAuth();
  const [birthDate, setBirthDate] = useState("");
  const [name, setName] = useState("");
  const [fromProfile, setFromProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<MatrixFreeSummary | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [pending, startTransition] = useTransition();
  const autoRanRef = useRef(false);

  const runCalculate = (date: string, personName: string) => {
    setError(null);
    startTransition(() => {
      const result = buildMatrixFreeSummary(date, { name: personName || undefined });
      if (!result) {
        setSummary(null);
        setError("Введите корректную дату рождения.");
        return;
      }
      setSummary(result);
    });
  };

  useEffect(() => {
    if (authLoading || autoRanRef.current) return;

    let cancelled = false;

    async function hydrateFromProfile() {
      let nextName = "";
      let nextDate = "";

      const local = readStoredProfile();
      if (local) {
        nextName = local.name?.trim() ?? "";
        nextDate = toDateInputValue(local.birthDate);
      }
      if (!nextName && user?.name) {
        nextName = user.name.trim();
      }

      if (isLoggedIn) {
        try {
          const res = await fetch("/api/profile", { credentials: "include" });
          if (res.ok) {
            const data = (await res.json()) as {
              profile?: { name?: string; birthDate?: string } | null;
            };
            const profile = data.profile;
            if (profile?.name?.trim()) nextName = profile.name.trim();
            const serverDate = toDateInputValue(profile?.birthDate);
            if (serverDate) nextDate = serverDate;
          }
        } catch {
          /* keep local fallback */
        }
      }

      if (cancelled) return;

      // OAuth / Latin full names → short Russian given name (e.g. Gennady Kharitonov → Геннадий)
      nextName = normalizePersonDisplayName(nextName);

      if (nextName) setName(nextName);
      if (nextDate) setBirthDate(nextDate);
      if (nextName || nextDate) setFromProfile(true);

      if (nextDate && parseBirthDate(nextDate)) {
        autoRanRef.current = true;
        runCalculate(nextDate, nextName);
      }
    }

    void hydrateFromProfile();
    return () => {
      cancelled = true;
    };
    // Hydrate once after auth settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn, user?.name]);

  useEffect(() => {
    if (!summary) {
      setRevealed(0);
      return;
    }
    setRevealed(0);
    let step = 0;
    const id = window.setInterval(() => {
      step += 1;
      setRevealed(step);
      if (step >= DESTINY_MATRIX_UI_SLOT_COUNT) window.clearInterval(id);
    }, 90);
    return () => window.clearInterval(id);
  }, [summary]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    runCalculate(birthDate, name);
  }

  return (
    <div id="calculate" className="destiny-matrix-preview mt-10 scroll-mt-24">
      <h2 className="font-display text-xl font-semibold text-white">Рассчитать бесплатно</h2>
      <p className="mt-2 text-sm text-white/55">
        {fromProfile
          ? "Подставили данные из вашего профиля — можно сразу смотреть результат или изменить поля."
          : "Нужна только дата рождения. Базовый результат — сразу на экране, без регистрации."}{" "}
        Полный AI-разбор с Эвелиной — от {PRICING.NUMEROLOGY_SESSION} ᚢ.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-3">
        <label className="block text-sm text-white/70">
          Дата рождения
          <input
            type="date"
            required
            value={birthDate}
            onChange={(e) => {
              setBirthDate(e.target.value);
              setFromProfile(false);
            }}
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-aura-gold/40"
          />
        </label>
        <label className="block text-sm text-white/70">
          Имя <span className="text-white/35">(необязательно)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setFromProfile(false);
            }}
            maxLength={40}
            placeholder="Как к вам обращаться"
            className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-aura-gold/40"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center rounded-xl bg-aura-gold px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Считаем…" : summary ? "Пересчитать" : "Рассчитать бесплатно"}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {summary ? (
        <div className="mt-8 space-y-6">
          <DestinyMatrixGrid
            matrix={summary.matrix}
            revealed={revealed}
            hint="Авторский расчёт Zovus (matrix-v1). Цифры фиксированы движком — ИИ их не пересчитывает."
          />

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-aura-gold/70">Короткий портрет</p>
            <p className="mt-2 text-sm leading-relaxed text-white/80">{summary.portrait}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {summary.keyArcana.map((item) => (
              <div
                key={item.role}
                className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3"
              >
                <p className="text-[0.65rem] uppercase tracking-[0.12em] text-white/40">{item.role}</p>
                <p className="mt-1 font-display text-lg text-white">
                  {item.number} · {item.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-white/55">{item.shortMeaning}</p>
              </div>
            ))}
          </div>

          <ul className="space-y-2 text-sm text-white/70">
            <li>{summary.moneyInsight}</li>
            <li>{summary.loveInsight}</li>
            <li>{summary.yearInsight}</li>
          </ul>

          <div className="rounded-2xl border border-dashed border-aura-gold/25 bg-aura-gold/[0.04] p-4">
            <p className="text-sm font-medium text-aura-gold">Полный разбор закрыт в preview</p>
            <ul className="mt-3 space-y-1.5 text-sm text-white/55">
              {LOCKED_SECTIONS.map((label) => (
                <li key={label} className="flex gap-2">
                  <span aria-hidden className="text-white/25">
                    ░
                  </span>
                  {label}
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <SeoTrackedCta
                href={FULL_HREF}
                trackGoal="matrix_cta_full"
                trackParams={{ source: "preview" }}
              >
                Открыть полный разбор с Эвелиной
              </SeoTrackedCta>
            </div>
            <p className="mt-2 text-xs text-white/40">
              {isLoggedIn
                ? `Сессия нумерологии — ${PRICING.NUMEROLOGY_SESSION} ᚢ.`
                : `Нужен вход в аккаунт. Сессия нумерологии — ${PRICING.NUMEROLOGY_SESSION} ᚢ.`}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
