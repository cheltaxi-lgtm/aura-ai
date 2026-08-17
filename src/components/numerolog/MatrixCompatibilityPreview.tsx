"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  confirmAgeGateOnServer,
  isAgeGateConfirmed,
} from "@/lib/age-gate";
import LegalDocLink from "@/components/legal/LegalDocLink";
import { useAuth } from "@/lib/useAuth";
import { buildLoginHref, buildRegisterHref } from "@/lib/post-auth-return";
import StarterRunesValue from "@/components/auth/StarterRunesValue";
import CrossProductNextSteps from "@/components/CrossProductNextSteps";
import { trackSeoEvent } from "@/lib/seo/metrika";
import { trackProductFunnel } from "@/lib/seo/product-funnel";
import { PRICING } from "@/lib/config/pricing";
import type { MatrixCompatFreeSummary } from "@/lib/numerology/matrix-compat-free-summary";
import { parseBirthDate } from "@/lib/numerology/constants";
import {
  FREE_TO_PAID,
  freeToPaidCtaLabel,
  freeToPaidFunnelState,
  freeToPaidHint,
} from "@/lib/free-to-paid-conversion";

const RESUME_RETURN = "/numerology/matrica-sovmestimosti?resumePair=1";
const FULL_HREF = "/?numerolog=1&tool=matrix_compatibility&resumePair=1";
/** UI navigation intent only — NOT a claim secret. */
const PENDING_INTENT_KEY = "matrix:pair-resume-intent";
/** One-shot pair params after claim (not authoritative claim secret). */
const PAIR_RESUME_KEY = "matrix:pair-resume";

type ConflictInfo = {
  existingBirthDate: string | null;
  guestBirthDate: string;
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

function storePairResume(payload: {
  dateA: string;
  dateB: string;
  nameA: string | null;
  nameB: string | null;
  score: number;
}) {
  try {
    sessionStorage.setItem(PAIR_RESUME_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export default function MatrixCompatibilityPreview() {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const [ageReady, setAgeReady] = useState(false);
  const [ageConfirming, setAgeConfirming] = useState(false);
  const [ageGateError, setAgeGateError] = useState("");

  const [dateA, setDateA] = useState("");
  const [dateB, setDateB] = useState("");
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MatrixCompatFreeSummary | null>(null);
  const [pendingBirths, setPendingBirths] = useState<{ dateA: string; dateB: string } | null>(
    null
  );
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [ownedPair, setOwnedPair] = useState(false);
  const claimStartedRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (isLoggedIn || isAgeGateConfirmed()) {
      setAgeReady(true);
    }
  }, [authLoading, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !preview || !pendingId) {
      setOwnedPair(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/numerology/matrix-pair-owned?pendingId=${encodeURIComponent(pendingId)}`,
          { credentials: "include" }
        );
        if (!res.ok) {
          if (!cancelled) setOwnedPair(false);
          return;
        }
        const data = (await res.json()) as { owned?: unknown };
        if (!cancelled) setOwnedPair(data.owned === true);
      } catch {
        if (!cancelled) setOwnedPair(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, preview, pendingId]);

  const runClaim = useCallback(async (confirmReplace = false) => {
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch("/api/numerology/matrix-pair-claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmReplace }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
        workspacePath?: string;
        dateA?: string;
        dateB?: string;
        nameA?: string | null;
        nameB?: string | null;
        score?: number;
        conflict?: ConflictInfo;
      };
      if (res.status === 409 && data.code === "MATRIX_PROFILE_CONFLICT") {
        setConflict(data.conflict ?? null);
        trackSeoEvent("matrix_pair_guest_claim_conflict");
        setClaiming(false);
        return;
      }
      if (!res.ok) {
        setClaimError(
          data.message ||
            "Не удалось сохранить расчёт совместимости. Рассчитайте пару снова."
        );
        clearPendingClaimIntent();
        setClaiming(false);
        return;
      }
      if (data.dateA && data.dateB) {
        storePairResume({
          dateA: data.dateA,
          dateB: data.dateB,
          nameA: data.nameA ?? null,
          nameB: data.nameB ?? null,
          score: typeof data.score === "number" ? data.score : 0,
        });
      }
      clearPendingClaimIntent();
      trackSeoEvent("matrix_pair_guest_claim_complete");
      trackProductFunnel("claim_complete", {
        product: "matrix_compatibility",
        source: "guest_claim",
      });
      window.location.assign(data.workspacePath || FULL_HREF);
    } catch {
      setClaimError("Не удалось сохранить расчёт. Проверьте соединение.");
      setClaiming(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isLoggedIn || claimStartedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const resume = params.get("resumePair") === "1";
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

  async function persistPair(nextA: string, nextB: string, nA: string, nB: string) {
    const res = await fetch("/api/numerology/matrix-pair-guest", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dateA: nextA,
        dateB: nextB,
        nameA: nA.trim() || null,
        nameB: nB.trim() || null,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      pending?: {
        pendingId?: string;
        dateA: string;
        dateB: string;
        preview: MatrixCompatFreeSummary;
      };
      code?: string;
    };
    if (!res.ok || !data.pending?.preview) {
      if (data.code === "age_required") {
        setAgeReady(false);
        throw new Error("age_required");
      }
      throw new Error("persist_failed");
    }
    setPreview(data.pending.preview);
    setPendingBirths({ dateA: data.pending.dateA, dateB: data.pending.dateB });
    setPendingId(data.pending.pendingId ?? null);
    markPendingClaimIntent();
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ageReady || pending) return;
    setError(null);
    setConflict(null);
    setClaimError(null);

    if (!parseBirthDate(dateA) || !parseBirthDate(dateB)) {
      setError("Укажите корректные даты рождения обоих партнёров.");
      return;
    }

    setPending(true);
    trackSeoEvent("matrix_pair_guest_calc_start");
    trackProductFunnel("free_start", {
      product: "matrix_compatibility",
      source: "guest_calc",
    });
    try {
      await persistPair(dateA, dateB, nameA, nameB);
      trackSeoEvent("matrix_pair_guest_calc_complete");
      trackProductFunnel("free_complete", {
        product: "matrix_compatibility",
        source: "guest_calc",
      });
      if (isLoggedIn && !claimStartedRef.current) {
        claimStartedRef.current = true;
        void runClaim(false);
      }
    } catch (err) {
      if (err instanceof Error && err.message === "age_required") {
        setError("Подтвердите возраст 18+.");
      } else {
        setError("Не удалось рассчитать совместимость. Проверьте даты и попробуйте ещё раз.");
      }
    } finally {
      setPending(false);
    }
  }

  async function openFullReport() {
    trackSeoEvent("matrix_pair_cta_full");
    trackProductFunnel("paid_cta", {
      product: "matrix_compatibility",
      source: "pair_full",
      state: freeToPaidFunnelState(ownedPair),
    });
    if (!isLoggedIn) {
      trackProductFunnel("auth_cta", {
        product: "matrix_compatibility",
        source: "pair_full",
      });
      if (!dateA || !dateB || !parseBirthDate(dateA) || !parseBirthDate(dateB)) {
        setError("Сначала рассчитайте совместимость по двум датам.");
        return;
      }
      try {
        if (
          !pendingBirths ||
          pendingBirths.dateA !== dateA ||
          pendingBirths.dateB !== dateB
        ) {
          await persistPair(dateA, dateB, nameA, nameB);
        }
        markPendingClaimIntent();
        window.location.assign(buildRegisterHref(RESUME_RETURN));
      } catch {
        setError("Не удалось сохранить расчёт перед входом. Попробуйте ещё раз.");
      }
      return;
    }
    claimStartedRef.current = true;
    void runClaim(false);
  }

  if (!authLoading && !ageReady) {
    return (
      <div id="calculate" className="mt-10 scroll-mt-24">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-xs uppercase tracking-[0.14em] text-aura-gold/70">
            Подтверждение возраста
          </p>
          <h2 className="font-display mt-3 text-xl font-semibold text-white">
            Сервис только для взрослых 18+
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Расчёт совместимости по датам рождения — ознакомительный сервис методики Zovus.{" "}
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
            {ageConfirming ? "Подтверждаем…" : "Мне есть 18 лет — рассчитать совместимость"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="calculate" className="mt-10 scroll-mt-24">
      <h2 className="font-display text-xl font-semibold text-white">
        Совместимость матриц — бесплатный расчёт
      </h2>
      <p className="mt-2 text-sm text-white/55">
        Укажите две даты рождения. Score и акценты — по методике Zovus (не универсальный
        «официальный» показатель). Полный разбор пары с Эвелиной — {PRICING.MATRIX_PAIR_REPORT} ᚢ.
      </p>

      {claimError ? (
        <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-50">
          <p>{claimError}</p>
        </div>
      ) : null}

      {conflict ? (
        <div className="mt-5 rounded-xl border border-white/15 bg-white/[0.04] p-5">
          <h3 className="font-display text-lg text-white">
            В аккаунте уже сохранена другая дата рождения
          </h3>
          <p className="mt-2 text-sm text-white/60">
            Сейчас в профиле: {conflict.existingBirthDate ?? "—"}.
            <br />
            Дата «вы» из этой пары: {conflict.guestBirthDate}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={claiming}
              onClick={() => void runClaim(true)}
              className="inline-flex items-center justify-center rounded-xl bg-aura-gold px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
            >
              Использовать данные этой пары
            </button>
            <a
              href={FULL_HREF}
              className="inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-2.5 text-sm text-white/80"
              onClick={() => clearPendingClaimIntent()}
            >
              Открыть полный разбор без замены
            </a>
          </div>
        </div>
      ) : null}

      {!preview ? (
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-white/45">
              Вы — дата рождения
            </span>
            <input
              type="date"
              required
              value={dateA}
              onChange={(e) => setDateA(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-aura-gold/50"
            />
            <input
              type="text"
              value={nameA}
              onChange={(e) => setNameA(e.target.value)}
              placeholder="Имя (необязательно)"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none focus:border-aura-gold/40"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-[0.12em] text-white/45">
              Партнёр — дата рождения
            </span>
            <input
              type="date"
              required
              value={dateB}
              onChange={(e) => setDateB(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-aura-gold/50"
            />
            <input
              type="text"
              value={nameB}
              onChange={(e) => setNameB(e.target.value)}
              placeholder="Имя партнёра (необязательно)"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80 outline-none focus:border-aura-gold/40"
            />
          </label>
          {error ? (
            <p className="sm:col-span-2 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending || claiming}
              className="inline-flex items-center justify-center rounded-xl bg-aura-gold px-4 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              {pending ? "Считаем…" : "Рассчитать совместимость"}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-8 space-y-6">
          <div className="rounded-2xl border border-aura-gold/25 bg-aura-gold/[0.05] p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-aura-gold/70">
              Методика Zovus · score пары
            </p>
            <p className="font-display mt-2 text-4xl font-semibold text-white">
              {preview.score}
              <span className="text-lg text-white/50">/100</span>
            </p>
            <p className="mt-3 text-sm text-white/70">{preview.summary}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {preview.zones.map((z) => (
              <div
                key={z.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
              >
                <p className="text-xs uppercase tracking-[0.12em] text-white/45">{z.label}</p>
                <p className="mt-1 text-lg font-medium text-white">
                  {z.score}
                  <span className="text-sm text-white/40">/100</span>
                </p>
                <p className="mt-2 text-sm text-white/60">{z.note}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="font-display text-lg text-white">Сильные стороны</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-white/65">
              {preview.strengths.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="text-aura-gold/70" aria-hidden>
                    •
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-display text-lg text-white">Зоны напряжения</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-white/65">
              {preview.tensions.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="text-white/35" aria-hidden>
                    •
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <CrossProductNextSteps context="matrix_compatibility" />

          <div className="rounded-2xl border border-dashed border-aura-gold/25 bg-aura-gold/[0.04] p-4">
            <p className="text-sm font-medium text-aura-gold">Полный разбор пары пока скрыт</p>
            <p className="mt-2 text-sm text-white/55">
              В полном разборе — практика по ключам, общий совет на 30 дней и диалог с Эвелиной.
              После входа откроется та же пара дат.
            </p>
            {!isLoggedIn ? (
              <StarterRunesValue
                variant="badge"
                costKey="MATRIX_PAIR_REPORT"
                unit={["парный разбор", "парных разбора", "парных разборов"]}
                product="matrix_pair"
                className="mt-3"
              />
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={claiming}
                onClick={() => void openFullReport()}
                className="btn-luxe btn-luxe--md btn-luxe--gold inline-flex disabled:opacity-60"
              >
                {claiming
                  ? "Сохраняем…"
                  : freeToPaidCtaLabel(FREE_TO_PAID.matrix_pair, ownedPair)}
              </button>
              {!isLoggedIn ? (
                <button
                  type="button"
                  className="text-sm text-aura-champagne/80 underline-offset-2 hover:underline"
                  onClick={() => {
                    void (async () => {
                      try {
                        if (
                          !pendingBirths ||
                          pendingBirths.dateA !== dateA ||
                          pendingBirths.dateB !== dateB
                        ) {
                          await persistPair(dateA, dateB, nameA, nameB);
                        }
                        markPendingClaimIntent();
                        window.location.assign(buildLoginHref(RESUME_RETURN));
                      } catch {
                        setError("Не удалось сохранить расчёт перед входом.");
                      }
                    })();
                  }}
                >
                  Уже есть аккаунт — войти
                </button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-white/40">
              {freeToPaidHint(FREE_TO_PAID.matrix_pair, ownedPair)}
            </p>
          </div>

          <button
            type="button"
            className="text-sm text-white/50 underline-offset-2 hover:underline"
            onClick={() => {
              setPreview(null);
              setPendingBirths(null);
              setPendingId(null);
              clearPendingClaimIntent();
            }}
          >
            Рассчитать другую пару
          </button>
        </div>
      )}
    </div>
  );
}
