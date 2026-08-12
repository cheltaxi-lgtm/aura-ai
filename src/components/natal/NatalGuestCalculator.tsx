"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  confirmAgeGateOnServer,
  isAgeGateConfirmed,
} from "@/lib/age-gate";
import LegalDocLink from "@/components/legal/LegalDocLink";
import { useAuth } from "@/lib/useAuth";
import { buildLoginHref, buildRegisterHref } from "@/lib/post-auth-return";
import { trackSeoEvent } from "@/lib/seo/metrika";
import type { NatalGuestSafePayload } from "@/lib/natal/guest-free-summary";

const NatalChartWheel = dynamic(() => import("@/components/natal/NatalChartWheel"), {
  ssr: false,
});

const RESUME_RETURN = "/natalnaya-karta?resumeNatal=1";
const PENDING_INTENT_KEY = "natal:pending-claim";

type PlaceOption = {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

type ConflictInfo = {
  existingBirthDate: string | null;
  existingBirthCity: string | null;
  guestBirthDate: string;
  guestPlaceLabel: string;
};

function markPendingClaimIntent() {
  try {
    sessionStorage.setItem(PENDING_INTENT_KEY, "1");
  } catch {
    /* ignore */
  }
}

function clearPendingClaimIntent() {
  try {
    sessionStorage.removeItem(PENDING_INTENT_KEY);
  } catch {
    /* ignore */
  }
}

function hasPendingClaimIntent(): boolean {
  try {
    return sessionStorage.getItem(PENDING_INTENT_KEY) === "1";
  } catch {
    return false;
  }
}

export default function NatalGuestCalculator() {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [ageReady, setAgeReady] = useState(false);
  const [ageConfirming, setAgeConfirming] = useState(false);
  const [ageGateError, setAgeGateError] = useState("");

  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [place, setPlace] = useState<PlaceOption | null>(null);
  const [places, setPlaces] = useState<PlaceOption[]>([]);
  const [placesOpen, setPlacesOpen] = useState(false);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NatalGuestSafePayload | null>(null);

  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const claimStartedRef = useRef(false);
  const placeBoxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (isLoggedIn || isAgeGateConfirmed()) {
      setAgeReady(true);
    }
  }, [authLoading, isLoggedIn]);

  const searchPlaces = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setPlaces([]);
      setPlacesOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetch(`/api/natal-chart/places?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const list = Array.isArray(d?.places) ? (d.places as PlaceOption[]) : [];
          setPlaces(list);
          setPlacesOpen(list.length > 0);
        })
        .catch(() => {
          setPlaces([]);
          setPlacesOpen(false);
        });
    }, 280);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (placeBoxRef.current && !placeBoxRef.current.contains(e.target as Node)) {
        setPlacesOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const runClaim = useCallback(
    async (confirmReplace = false) => {
      setClaiming(true);
      setClaimError(null);
      try {
        const res = await fetch("/api/natal-chart/claim", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmReplace }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          code?: string;
          message?: string;
          workspacePath?: string;
          conflict?: ConflictInfo;
        };
        if (res.status === 409 && data.code === "NATAL_PROFILE_CONFLICT") {
          setConflict(data.conflict ?? null);
          trackSeoEvent("natal_guest_claim_conflict");
          setClaiming(false);
          return;
        }
        if (!res.ok) {
          setClaimError(
            data.message ||
              "Не удалось автоматически сохранить рассчитанную карту. Постройте карту снова или откройте кабинет."
          );
          clearPendingClaimIntent();
          setClaiming(false);
          return;
        }
        clearPendingClaimIntent();
        trackSeoEvent("natal_guest_claim_complete");
        window.location.assign(data.workspacePath || "/cabinet/astrology?natalClaimed=1");
      } catch {
        setClaimError(
          "Не удалось автоматически сохранить рассчитанную карту. Проверьте соединение и попробуйте ещё раз."
        );
        setClaiming(false);
      }
    },
    []
  );

  useEffect(() => {
    if (authLoading || !isLoggedIn || claimStartedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const resume = params.get("resumeNatal") === "1";
    if (!resume && !hasPendingClaimIntent()) return;
    claimStartedRef.current = true;
    void runClaim(false);
  }, [authLoading, isLoggedIn, runClaim]);

  async function confirmAge() {
    setAgeConfirming(true);
    setAgeGateError("");
    const ok = await confirmAgeGateOnServer();
    setAgeConfirming(false);
    if (!ok) {
      setAgeGateError("Не удалось подтвердить возраст. Обновите страницу и попробуйте ещё раз.");
      return;
    }
    setAgeReady(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ageReady || pending) return;
    setError(null);
    setConflict(null);
    setClaimError(null);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setError("Укажите дату рождения.");
      return;
    }
    if (!timeUnknown && !/^([01]\d|2[0-3]):[0-5]\d$/.test(birthTime)) {
      setError("Укажите время рождения или отметьте, что точное время неизвестно.");
      return;
    }
    if (!place) {
      setError("Выберите место рождения из списка.");
      return;
    }

    setPending(true);
    trackSeoEvent("natal_guest_calc_start");
    try {
      const res = await fetch("/api/natal-chart/guest", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate,
          birthTime: timeUnknown ? null : birthTime,
          timeKnown: !timeUnknown,
          place,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        chart?: NatalGuestSafePayload;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.chart) {
        if (data.code === "age_required") {
          setAgeReady(false);
          setError("Подтвердите возраст 18+.");
        } else {
          setError("Не удалось построить карту. Проверьте данные и попробуйте ещё раз.");
        }
        setPending(false);
        return;
      }
      setResult(data.chart);
      markPendingClaimIntent();
      trackSeoEvent("natal_guest_calc_complete");
      if (isLoggedIn) {
        claimStartedRef.current = true;
        void runClaim(false);
      }
    } catch {
      setError("Не удалось построить карту. Проверьте соединение.");
    } finally {
      setPending(false);
    }
  }

  if (!authLoading && !ageReady) {
    return (
      <div id="natal-calculator" className="mt-10 scroll-mt-24">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-xs uppercase tracking-[0.14em] text-aura-gold/70">
            Подтверждение возраста
          </p>
          <h2 className="font-display mt-3 text-xl font-semibold text-white">
            Сервис только для взрослых 18+
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Расчёт натальной карты использует дату, время и место рождения как персональные данные.
            Подтвердите, что вам исполнилось 18 лет.{" "}
            <LegalDocLink
              href="/privacy"
              className="text-aura-champagne/80 underline-offset-2 hover:underline"
            >
              Политика конфиденциальности
            </LegalDocLink>
            .
          </p>
          {ageGateError ? (
            <p className="mt-3 text-sm text-red-300" role="alert">
              {ageGateError}
            </p>
          ) : null}
          <button
            type="button"
            disabled={ageConfirming}
            onClick={() => void confirmAge()}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-aura-gold px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
          >
            {ageConfirming ? "Подтверждаем…" : "Мне есть 18 лет — построить карту"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="natal-calculator" className="mt-10 scroll-mt-24">
      <h2 className="font-display text-xl font-semibold text-white">
        Постройте свою натальную карту
      </h2>
      <p className="mt-2 text-sm text-white/55">
        Укажите дату, время и место рождения. Карта появится прямо здесь — регистрация для расчёта
        не нужна.
      </p>

      {claimError ? (
        <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-50">
          <p>{claimError}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              className="text-aura-gold underline-offset-2 hover:underline"
              onClick={() => {
                setResult(null);
                setClaimError(null);
                clearPendingClaimIntent();
              }}
            >
              Вернуться к калькулятору
            </button>
            <a href="/cabinet/astrology" className="text-aura-gold underline-offset-2 hover:underline">
              Открыть кабинет
            </a>
          </div>
        </div>
      ) : null}

      {conflict ? (
        <div className="mt-5 rounded-xl border border-white/15 bg-white/[0.04] p-5">
          <h3 className="font-display text-lg text-white">
            В аккаунте уже сохранены другие данные рождения
          </h3>
          <p className="mt-2 text-sm text-white/60">
            Сейчас в профиле: {conflict.existingBirthDate ?? "—"}
            {conflict.existingBirthCity ? `, ${conflict.existingBirthCity}` : ""}.
            <br />
            Рассчитанная карта: {conflict.guestBirthDate}, {conflict.guestPlaceLabel}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={claiming}
              onClick={() => void runClaim(true)}
              className="inline-flex items-center justify-center rounded-xl bg-aura-gold px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
            >
              Использовать данные этой карты
            </button>
            <a
              href="/cabinet/astrology"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-2.5 text-sm text-white/80"
            >
              Открыть мою сохранённую карту
            </a>
          </div>
        </div>
      ) : null}

      {!result ? (
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-white/45">
              Дата рождения
            </span>
            <input
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-aura-gold/50"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-white/45">
              Время рождения
            </span>
            <input
              type="time"
              disabled={timeUnknown}
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-aura-gold/50 disabled:opacity-40"
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-white/60">
              <input
                type="checkbox"
                checked={timeUnknown}
                onChange={(e) => {
                  setTimeUnknown(e.target.checked);
                  if (e.target.checked) setBirthTime("");
                }}
              />
              Не знаю точное время
            </label>
          </div>

          <div ref={placeBoxRef} className="relative">
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-white/45">
                Место рождения
              </span>
              <input
                type="text"
                value={placeQuery}
                autoComplete="off"
                placeholder="Начните вводить город…"
                onChange={(e) => {
                  const q = e.target.value;
                  setPlaceQuery(q);
                  setPlace(null);
                  searchPlaces(q);
                }}
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-aura-gold/50"
              />
            </label>
            {placesOpen && places.length > 0 ? (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-white/15 bg-[#1a1520] py-1 shadow-xl">
                {places.map((p) => (
                  <li key={`${p.label}-${p.latitude}-${p.longitude}`}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-white/85 hover:bg-white/10"
                      onClick={() => {
                        setPlace(p);
                        setPlaceQuery(p.label);
                        setPlacesOpen(false);
                      }}
                    >
                      {p.label}
                      <span className="mt-0.5 block text-[11px] text-white/40">{p.timezone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {place ? (
              <p className="mt-1.5 text-xs text-aura-gold/70">Выбрано: {place.label}</p>
            ) : null}
          </div>

          {error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || claiming}
            className="inline-flex w-full items-center justify-center rounded-xl bg-aura-gold px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60 sm:w-auto"
          >
            {pending ? "Строим карту…" : "Построить мою карту"}
          </button>
        </form>
      ) : (
        <div className="mt-8 space-y-6">
          <div>
            <h3 className="font-display text-2xl font-semibold text-white">Ваша карта построена</h3>
            <p className="mt-2 text-sm text-white/60">
              Ниже — основные акценты карты. Полный разбор связывает планеты, аспекты и жизненные
              сферы в одну картину.
            </p>
            {!result.timeKnown ? (
              <p className="mt-2 text-sm text-amber-100/70">
                Точное время неизвестно — асцендент, MC и дома не показываем как достоверные.
              </p>
            ) : null}
          </div>

          {result.western ? (
            <div className="overflow-x-auto">
              <div className="mx-auto w-full max-w-[520px]">
                <NatalChartWheel western={result.western} timeKnown={result.timeKnown} size={360} />
              </div>
            </div>
          ) : null}

          {result.bigThree.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {result.bigThree.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-aura-gold/30 bg-aura-gold/10 px-3 py-1 text-sm text-aura-champagne"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {result.highlights.map((h) => (
              <div key={h.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="font-medium text-white">{h.title}</p>
                <p className="mt-1 text-sm text-white/65">{h.text}</p>
              </div>
            ))}
          </div>

          {result.majorAspects.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-white/45">Крупные аспекты</p>
              <ul className="mt-2 space-y-1.5 text-sm text-white/70">
                {result.majorAspects.slice(0, 5).map((a, i) => (
                  <li key={`${a.first}-${a.second}-${i}`}>
                    {a.first} — {a.label.toLowerCase()} — {a.second}
                    {a.orb != null ? ` (${a.orb.toFixed(1)}°)` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border border-aura-gold/25 bg-gradient-to-br from-aura-gold/10 to-transparent p-5">
            <h4 className="font-display text-xl text-white">Получить полный разбор</h4>
            <p className="mt-2 text-sm text-white/65">
              После входа эта же карта сохранится в Вашем пространстве.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {isLoggedIn ? (
                <button
                  type="button"
                  disabled={claiming}
                  onClick={() => {
                    trackSeoEvent("natal_guest_full_cta");
                    void runClaim(false);
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-aura-gold px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
                >
                  {claiming ? "Сохраняем…" : "Открыть полный разбор"}
                </button>
              ) : (
                <>
                  <a
                    href={buildRegisterHref(RESUME_RETURN)}
                    onClick={() => {
                      markPendingClaimIntent();
                      trackSeoEvent("natal_guest_full_cta");
                    }}
                    className="inline-flex items-center justify-center rounded-xl bg-aura-gold px-4 py-2.5 text-sm font-semibold text-black"
                  >
                    Получить полный разбор
                  </a>
                  <a
                    href={buildLoginHref(RESUME_RETURN)}
                    onClick={() => markPendingClaimIntent()}
                    className="inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-2.5 text-sm text-white/80"
                  >
                    Уже есть аккаунт
                  </a>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            className="text-sm text-white/45 underline-offset-2 hover:underline"
            onClick={() => {
              setResult(null);
              clearPendingClaimIntent();
            }}
          >
            Построить другую карту
          </button>
        </div>
      )}
    </div>
  );
}
