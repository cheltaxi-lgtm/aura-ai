"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import DestinyMatrixGrid, {
  DESTINY_MATRIX_UI_SLOT_COUNT,
} from "@/components/numerolog/DestinyMatrixGrid";
import { MATRIX_CALCULATION_VERSION } from "@/lib/numerology/destiny-matrix";
import { buildMatrixFreeSummary, type MatrixFreeSummary } from "@/lib/numerology/matrix-free-summary";
import { downloadMatrixShareCardSvg } from "@/lib/numerology/matrix-share-card-svg";
import { parseBirthDate } from "@/lib/numerology/constants";
import { readStoredProfile } from "@/lib/home-flow-storage";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { useAuth } from "@/lib/useAuth";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { PRICING } from "@/lib/config/pricing";
import {
  confirmAgeGateOnServer,
  isAgeGateConfirmed,
} from "@/lib/age-gate";
import LegalDocLink from "@/components/legal/LegalDocLink";
import { trackSeoEvent } from "@/lib/seo/metrika";
import { useMatrixOwnership } from "@/hooks/useMatrixOwnership";
import { useMatrixSubjects } from "@/hooks/useMatrixSubjects";
import MatrixSubjectPicker from "@/components/numerolog/MatrixSubjectPicker";

const FULL_HREF = "/?numerolog=1&tool=destiny_matrix";

const LOCKED_SECTIONS = [
  "Полный разбор зоны комфорта и всех каналов",
  "Кармический хвост: корень → середина → остриё",
  "Точки возраста и ближайший переход",
  "Узел периода + практика на 7 дней",
  "Слой «Небо» (натал) при времени и городе",
  "Практика на 30 дней и вопросы Эвелине",
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
  /** null = guest / unknown; false = missing time or city for «Небо». */
  const [skyProfileComplete, setSkyProfileComplete] = useState<boolean | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const matrixSubjects = useMatrixSubjects({ enabled: isLoggedIn });
  const matrixOwnership = useMatrixOwnership({
    enabled: isLoggedIn && Boolean(birthDate && parseBirthDate(birthDate)),
    birthDate: birthDate || null,
    subjectId: selectedSubjectId,
  });
  const ownedFull = matrixOwnership.owned;
  const [pending, startTransition] = useTransition();
  const [ageReady, setAgeReady] = useState(false);
  const [ageConfirming, setAgeConfirming] = useState(false);
  const [ageGateError, setAgeGateError] = useState("");
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
      trackSeoEvent("matrix_preview_complete");
    });
  };

  useEffect(() => {
    // Registered users already confirmed 18+ at signup; guests need the age gate.
    if (authLoading) return;
    if (isLoggedIn || isAgeGateConfirmed()) {
      setAgeReady(true);
    }
  }, [authLoading, isLoggedIn]);

  useEffect(() => {
    if (authLoading || !ageReady || autoRanRef.current) return;

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
              profile?: {
                name?: string;
                birthDate?: string;
                birthTime?: string;
                birthCity?: string;
              } | null;
            };
            const profile = data.profile;
            if (profile?.name?.trim()) nextName = profile.name.trim();
            const serverDate = toDateInputValue(profile?.birthDate);
            if (serverDate) nextDate = serverDate;
            setSkyProfileComplete(
              Boolean(profile?.birthTime?.trim() && profile?.birthCity?.trim())
            );
          }
        } catch {
          /* keep local fallback */
        }
      } else {
        setSkyProfileComplete(null);
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
    // Hydrate once after auth + age gate settle.
  }, [authLoading, ageReady, isLoggedIn, user?.name]);

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

  const openFullMatrix = async () => {
    trackSeoEvent("matrix_cta_full", { source: "preview", owned: ownedFull ? "1" : "0" });
    if (selectedSubjectId) {
      window.location.assign(
        `${FULL_HREF}&subjectId=${encodeURIComponent(selectedSubjectId)}`
      );
      return;
    }
    const self = matrixSubjects.subjects.find((subject) => subject.kind === "self");
    if (isLoggedIn && birthDate && self && self.birthDate !== birthDate) {
      try {
        const subject = await matrixSubjects.create({
          kind: "other",
          displayName: name.trim() || undefined,
          birthDate,
        });
        window.location.assign(`${FULL_HREF}&subjectId=${encodeURIComponent(subject.id)}`);
        return;
      } catch {
        window.alert("Не удалось сохранить профиль для матрицы. Попробуйте ещё раз.");
        return;
      }
    }
    window.location.assign(
      self ? `${FULL_HREF}&subjectId=${encodeURIComponent(self.id)}` : FULL_HREF
    );
  };

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ageReady) return;
    runCalculate(birthDate, name);
  }

  if (!authLoading && !ageReady) {
    return (
      <div id="calculate" className="destiny-matrix-preview mt-10 scroll-mt-24">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <p className="text-xs uppercase tracking-[0.14em] text-aura-gold/70">
            Подтверждение возраста
          </p>
          <h2 className="font-display mt-3 text-xl font-semibold text-white">
            Сервис только для взрослых 18+
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Расчёт матрицы по дате рождения — развлекательно-ознакомительный сервис. Дата рождения
            обрабатывается как персональные данные. Подтвердите, что вам исполнилось 18 лет.{" "}
            <LegalDocLink href="/privacy" className="text-aura-champagne/80 underline-offset-2 hover:underline">
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
            {ageConfirming ? "Подтверждаем…" : "Мне есть 18 лет — рассчитать матрицу"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="calculate" className="destiny-matrix-preview mt-10 scroll-mt-24">
      <h2 className="font-display text-xl font-semibold text-white">Рассчитать бесплатно</h2>
      <p className="mt-2 text-sm text-white/55">
        Можно считать для себя, ребёнка, партнёра или любого человека — нужна только дата. Цифры
        матрицы бесплатны и всегда одинаковые. {PRICING.NUMEROLOGY_SESSION} ᚢ — за персональный
        разбор Эвелины с сохранением и {PRICING.MATRIX_INCLUDED_QUESTIONS} вопросами в чате.
      </p>
      <p className="mt-2 text-xs text-white/40">
        Сервис 18+. Дата рождения используется только для расчёта и не публикуется.
      </p>

      {isLoggedIn ? (
        <div className="mt-5">
          <MatrixSubjectPicker
            subjects={matrixSubjects.subjects}
            selectedId={selectedSubjectId}
            disabled={matrixSubjects.loading}
            costs={matrixSubjects.costs}
            onSelect={(id) => {
              setSelectedSubjectId(id);
              const subject = matrixSubjects.subjects.find((item) => item.id === id);
              if (!subject) return;
              setBirthDate(subject.birthDate);
              if (subject.displayName) setName(subject.displayName);
              setFromProfile(subject.kind === "self");
              if (parseBirthDate(subject.birthDate)) {
                runCalculate(subject.birthDate, subject.displayName || name);
              }
            }}
            onCreate={matrixSubjects.create}
            onCreated={(subject) => {
              setSelectedSubjectId(subject.id);
              setBirthDate(subject.birthDate);
              if (subject.displayName) setName(subject.displayName);
              setFromProfile(false);
              if (parseBirthDate(subject.birthDate)) {
                runCalculate(subject.birthDate, subject.displayName || name);
              }
            }}
          />
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/60">
          Войдите в аккаунт, чтобы сохранять матрицы на разных людей (ребёнок, партнёр и др.).
        </p>
      )}

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
            focusKey={summary.period.focusKey}
            hint={`Полная матрица Zovus (${MATRIX_CALCULATION_VERSION}, канонический расчёт). Цифры фиксированы движком — наставник их не пересчитывает.`}
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                downloadMatrixShareCardSvg({
                  matrix: summary.matrix,
                  name: name || undefined,
                  // Birth date omitted by default — PII on share cards.
                  includeBirthDate: false,
                });
                trackSeoEvent("matrix_share_card_download");
              }}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/85 transition hover:border-aura-gold/40 hover:text-white"
            >
              Скачать карточку для сторис
            </button>
          </div>

          <div className="rounded-2xl border border-aura-gold/25 bg-aura-gold/[0.05] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-aura-gold/80">
              Узел периода · 7 дней
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {summary.period.focusLabel}: {summary.period.focusTitle} ({summary.period.focusNumber})
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Практика на 7 дней: {summary.period.practiceSeed}
            </p>
            <p className="mt-2 text-xs text-white/45">
              Год {summary.period.yearArcana.number} · {summary.period.yearArcana.title}
              {" · "}
              Месяц {summary.period.monthArcana.number} · {summary.period.monthArcana.title}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-aura-gold/70">Сводка матрицы</p>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/85">
              {summary.denseTeaser || summary.portrait}
            </pre>
          </div>

          {isLoggedIn && skyProfileComplete === false ? (
            <div className="rounded-2xl border border-sky-400/25 bg-sky-500/[0.06] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-sky-200/80">Слой «Небо»</p>
              <p className="mt-2 text-sm text-white/80">
                Добавьте время и город рождения в профиле — в полном разборе откроется натальный
                слой поверх матрицы (цифры арканов не меняются).
              </p>
              <div className="mt-4">
                <SeoTrackedCta
                  href="/cabinet?profile=1&utm_campaign=matrix_sky"
                  trackGoal="matrix_cta_sky_profile"
                  trackParams={{ source: "preview" }}
                >
                  Дозаполнить профиль
                </SeoTrackedCta>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-dashed border-aura-gold/25 bg-aura-gold/[0.04] p-4">
            <p className="text-sm font-medium text-aura-gold">
              {ownedFull
                ? "Полный разбор уже куплен"
                : "Полный разбор пока скрыт в бесплатном расчёте"}
            </p>
            {ownedFull ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-white/65">
                  Разбор сохранён для этой даты рождения. Откройте с Эвелиной бесплатно — без
                  повторной оплаты за те же числа. Или закажите новый полный разбор.
                </p>
                <div className="flex flex-wrap gap-2">
                  {matrixOwnership.reportId ? (
                    <a
                      href={`/cabinet/numerology/matrix/${encodeURIComponent(matrixOwnership.reportId)}/print`}
                      className="inline-flex items-center justify-center rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:border-white/40 hover:text-white"
                    >
                      Печать / PDF
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        const subjectId =
                          selectedSubjectId ||
                          matrixOwnership.subjectId ||
                          matrixSubjects.subjects.find((s) => s.kind === "self")?.id ||
                          null;
                        if (!subjectId) {
                          window.alert("Выберите человека, чью матрицу пересчитать.");
                          return;
                        }
                        if (
                          !window.confirm(
                            `Удалить разбор этого человека и рассчитать заново за ${PRICING.NUMEROLOGY_SESSION} ᚢ? Старый текст исчезнет из кабинета и чата. Матрицы других людей не затронутся.`
                          )
                        ) {
                          return;
                        }
                        try {
                          const res = await fetch("/api/numerology/matrix-report", {
                            method: "DELETE",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              subjectId,
                              reportId: matrixOwnership.reportId,
                            }),
                          });
                          if (!res.ok) {
                            window.alert("Не удалось подготовить новую матрицу. Попробуйте ещё раз.");
                            return;
                          }
                          trackSeoEvent("matrix_report_replaced");
                          // DELETE wiped only this subject; reopen paid flow for the same person.
                          window.location.assign(
                            `${FULL_HREF}&subjectId=${encodeURIComponent(subjectId)}`
                          );
                        } catch {
                          window.alert("Не удалось подготовить новую матрицу. Проверьте соединение.");
                        }
                      })();
                    }}
                    className="inline-flex items-center justify-center rounded-xl border border-aura-gold/40 bg-aura-gold/10 px-4 py-2.5 text-sm font-medium text-aura-gold transition hover:border-aura-gold/60 hover:bg-aura-gold/15"
                  >
                    Пересчитать · {PRICING.NUMEROLOGY_SESSION} ᚢ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        const subjectId =
                          selectedSubjectId ||
                          matrixOwnership.subjectId ||
                          matrixSubjects.subjects.find((s) => s.kind === "self")?.id ||
                          null;
                        if (!subjectId && !matrixOwnership.reportId) {
                          window.alert("Выберите человека, чью матрицу удалить.");
                          return;
                        }
                        if (
                          !window.confirm(
                            "Удалить сохранённую матрицу этого человека безвозвратно? Исчезнет из кабинета и чата — разбор можно будет купить заново. Другие матрицы останутся."
                          )
                        ) {
                          return;
                        }
                        try {
                          const res = await fetch("/api/numerology/matrix-report", {
                            method: "DELETE",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              ...(subjectId ? { subjectId } : {}),
                              ...(matrixOwnership.reportId
                                ? { reportId: matrixOwnership.reportId }
                                : {}),
                            }),
                          });
                          if (!res.ok) {
                            window.alert("Не удалось удалить матрицу. Попробуйте ещё раз.");
                            return;
                          }
                          matrixOwnership.refetch();
                          trackSeoEvent("matrix_report_deleted");
                        } catch {
                          window.alert("Не удалось удалить матрицу. Проверьте соединение.");
                        }
                      })();
                    }}
                    className="inline-flex items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-200 transition hover:border-red-400/50 hover:bg-red-500/15"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ) : (
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
            )}
            <div className="mt-5">
              <button
                type="button"
                onClick={() => void openFullMatrix()}
                className="btn-luxe btn-luxe--md btn-luxe--gold inline-flex"
              >
                {ownedFull
                  ? "Открыть сохранённый разбор"
                  : "Открыть полный разбор с Эвелиной"}
              </button>
            </div>
            <p className="mt-2 text-xs text-white/40">
              {ownedFull
                ? `В комплекте — ${PRICING.MATRIX_INCLUDED_QUESTIONS} вопроса в чате, дальше по тарифу вопроса.`
                : isLoggedIn
                  ? `Платите за разбор Эвелины и сохранение, не за цифры — ${PRICING.NUMEROLOGY_SESSION} ᚢ один раз.`
                  : `Нужен вход. Затем ${PRICING.NUMEROLOGY_SESSION} ᚢ один раз за разбор с сохранением.`}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
