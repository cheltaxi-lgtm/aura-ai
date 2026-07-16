"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  HeartHandshake,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { usePaywall } from "@/contexts/PaywallContext";
import type { CompatibilityEvidence, CompatibilityReport } from "@/lib/natal/compatibility-report";
import type { ClientSynastryPayload } from "@/lib/natal/synastry";
import { useAuth } from "@/lib/useAuth";
import { useRuneConfig } from "@/lib/useRuneConfig";
import CompositeWheel from "./CompositeWheel";
import NatalSynastryWheel from "./NatalSynastryWheel";
import ReportShareControls from "./ReportShareControls";

type CompatibilityStatus = "pending" | "ready" | "completed" | "expired";
type CompatibilityRecord = {
  id: string;
  ownerUserId: string;
  participantUserId: string | null;
  mode: "manual" | "invite";
  status: CompatibilityStatus;
  ownerLabel: string;
  partnerLabel: string;
  synastry: ClientSynastryPayload | null;
  report: CompatibilityReport | null;
  evidence: CompatibilityEvidence | null;
  runeCost: number | null;
  expiresAt: string;
  completedAt: string | null;
  createdAt: string;
};

type ManualForm = {
  partnerLabel: string;
  birthDate: string;
  birthTime: string;
  timeKnown: boolean;
  birthCity: string;
};
type CitySuggestion = {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

const EMPTY_MANUAL: ManualForm = {
  partnerLabel: "",
  birthDate: "",
  birthTime: "",
  timeKnown: false,
  birthCity: "",
};

const STATUS_LABELS: Record<CompatibilityStatus, string> = {
  pending: "ожидает второго участника",
  ready: "расчёт готов",
  completed: "полный отчёт готов",
  expired: "срок истёк",
};

async function responseJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

async function waitForCompatibilityJob(jobId: string): Promise<Record<string, unknown>> {
  const storageKey = "aura:compatibility-active-job";
  const startedAtKey = "aura:compatibility-active-job-started";
  let terminal = false;
  window.localStorage.setItem(storageKey, jobId);
  if (!window.localStorage.getItem(startedAtKey)) {
    window.localStorage.setItem(startedAtKey, String(Date.now()));
  }
  try {
    const startedAt = Number(window.localStorage.getItem(startedAtKey) || Date.now());
    if (Number.isFinite(startedAt) && Date.now() - startedAt > 45 * 60_000) {
      terminal = true;
      throw new Error("Сохранённая генерация устарела. Запустите отчёт снова при необходимости.");
    }
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const job = await responseJson<{
        status?: string;
        result?: Record<string, unknown>;
        error?: string;
        refunded?: boolean;
      }>(response);
      if (response.status === 404) {
        terminal = true;
        throw new Error("Задача генерации не найдена. Запустите отчёт снова.");
      }
      if (!response.ok) throw new Error(job.error || "Не удалось проверить статус очереди.");
      if (job.status === "completed") {
        terminal = true;
        return job.result ?? {};
      }
      if (job.status === "failed") {
        terminal = true;
        const fallback = job.refunded
          ? "Отчёт не был создан. Оплата возвращена."
          : "Отчёт не был создан. Если руны списались — проверьте баланс или поддержку.";
        throw new Error(job.error || fallback);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
    }
    throw new Error("Отчёт ещё создаётся. Его статус сохранён, вернитесь к нему немного позже.");
  } finally {
    if (terminal) {
      window.localStorage.removeItem(storageKey);
      window.localStorage.removeItem(startedAtKey);
    }
  }
}

function errorMessage(code?: string): string {
  const messages: Record<string, string> = {
    chart_unavailable: "Сначала заполните дату и город рождения в профиле.",
    partner_chart_unavailable: "Не удалось рассчитать карту второго человека. Проверьте данные.",
    charts_not_ready: "Сначала нужны обе натальные карты.",
    generation_in_progress: "Отчёт уже создаётся. Подождите немного.",
    ai_data_use_acknowledgement_required: "Не удалось начать создание отчёта. Попробуйте ещё раз.",
    invite_expired: "Срок действия приглашения истёк.",
    cannot_accept_own_invite: "Нельзя принять собственное приглашение.",
    invite_already_claimed: "Приглашение уже принято другим человеком.",
    owner_chart_changed: "Карта инициатора изменилась. Попросите создать новое приглашение.",
    invalid_birth_date: "Проверьте дату рождения.",
    invalid_birth_time: "Проверьте время рождения.",
    invalid_birth_city: "Выберите корректный город рождения.",
    invalid_model_report: "Модель не смогла создать проверяемый отчёт. Оплата возвращена.",
  };
  return messages[code ?? ""] ?? "Не удалось выполнить действие. Попробуйте ещё раз.";
}

export default function NatalCompatibility() {
  const { user } = useAuth();
  const { openPaywall, showRateLimit } = usePaywall();
  const { cost } = useRuneConfig();
  const [records, setRecords] = useState<CompatibilityRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"manual" | "invite">("manual");
  const [manual, setManual] = useState<ManualForm>(EMPTY_MANUAL);
  const [manualConsent, setManualConsent] = useState(false);
  const [invitePartnerLabel, setInvitePartnerLabel] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteRecord, setInviteRecord] = useState<CompatibilityRecord | null>(null);
  const [participantLabel, setParticipantLabel] = useState("");
  const [participantConsent, setParticipantConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"create" | "invite" | "accept" | "generate" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [citySelected, setCitySelected] = useState(false);
  const [cityLookupOpen, setCityLookupOpen] = useState(false);
  const [cityLookupLoading, setCityLookupLoading] = useState(false);

  const inviteToken = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("invite")?.trim() ?? "";
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/natal-chart/compatibility", { credentials: "include" });
      const data = await responseJson<{ compatibility?: CompatibilityRecord[]; error?: string }>(response);
      if (!response.ok) throw new Error(data.error);
      const next = data.compatibility ?? [];
      setRecords(next);
      setSelectedId((current) => current ?? next.find((item) => item.status !== "expired")?.id ?? null);
    } catch (reason) {
      setError(errorMessage(reason instanceof Error ? reason.message : undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    if (!inviteToken) return;
    setMode("invite");
    void fetch(`/api/natal-chart/compatibility/token/${encodeURIComponent(inviteToken)}`, {
      credentials: "include",
    })
      .then(async (response) => {
        const data = await responseJson<{ record?: CompatibilityRecord; error?: string }>(response);
        if (!response.ok || !data.record) throw new Error(data.error);
        setInviteRecord(data.record);
        setParticipantLabel(data.record.partnerLabel === "Участник B" ? "" : data.record.partnerLabel);
      })
      .catch((reason) => setError(errorMessage(reason instanceof Error ? reason.message : undefined)));
  }, [inviteToken]);

  useEffect(() => {
    const query = manual.birthCity.trim();
    if (citySelected || query.length < 2) {
      setCitySuggestions([]);
      setCityLookupOpen(false);
      setCityLookupLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCityLookupLoading(true);
      void fetch(`/api/natal-chart/places?q=${encodeURIComponent(query)}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then((response) => responseJson<{
          places?: CitySuggestion[];
          error?: string;
        }>(response).then((data) => {
          if (!response.ok) throw new Error(data.error || "Не удалось найти города");
          return data;
        }))
        .then((data) => {
          setCitySuggestions((data.places ?? []).slice(0, 8));
          setCityLookupOpen(true);
        })
        .catch(() => {
          setCitySuggestions([]);
          setCityLookupOpen(true);
        })
        .finally(() => setCityLookupLoading(false));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [manual.birthCity, citySelected]);

  const selectCity = (city: CitySuggestion) => {
    setManual((value) => ({ ...value, birthCity: city.label }));
    setCitySelected(true);
    setCitySuggestions([]);
    setCityLookupOpen(false);
  };

  const selected = records.find((item) => item.id === selectedId) ?? null;
  const isOwner = selected?.ownerUserId === user?.profileUserId;

  const createManual = async () => {
    if (!manual.partnerLabel.trim() || !manual.birthDate || !manual.birthCity.trim()) {
      setError("Укажите имя, дату и город рождения второго человека.");
      return;
    }
    if (!citySelected) {
      setError("Выберите город из списка подсказок, чтобы проверить часовой пояс и координаты.");
      return;
    }
    if (manual.timeKnown && !manual.birthTime) {
      setError("Укажите время рождения или отметьте, что оно неизвестно.");
      return;
    }
    if (!manualConsent) {
      setError("Подтвердите право использовать данные второго человека.");
      return;
    }
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/natal-chart/compatibility/manual", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerLabel: manual.partnerLabel,
          partnerDataAuthorized: true,
          partner: {
            birthDate: manual.birthDate,
            birthTime: manual.birthTime,
            timeKnown: manual.timeKnown,
            birthCity: manual.birthCity,
          },
        }),
      });
      const data = await responseJson<{ record?: CompatibilityRecord; reused?: boolean; error?: string }>(response);
      if (response.status === 429) {
        showRateLimit("natal_compatibility_create", Number(response.headers.get("retry-after")) || undefined);
        return;
      }
      if (!response.ok || !data.record) throw new Error(data.error);
      setManual(EMPTY_MANUAL);
      setManualConsent(false);
      setCitySelected(false);
      setSelectedId(data.record.id);
      setNotice(data.reused ? "Открыт ранее созданный расчёт этой пары." : "Синастрия рассчитана. Теперь можно заказать полный отчёт.");
      await loadRecords();
    } catch (reason) {
      setError(errorMessage(reason instanceof Error ? reason.message : undefined));
    } finally {
      setBusy(null);
    }
  };

  const createInvite = async () => {
    if (!invitePartnerLabel.trim()) {
      setError("Укажите имя второго человека.");
      return;
    }
    setBusy("invite");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/natal-chart/compatibility/invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerLabel: invitePartnerLabel }),
      });
      const data = await responseJson<{
        record?: CompatibilityRecord;
        token?: string;
        error?: string;
      }>(response);
      if (!response.ok || !data.record || !data.token) throw new Error(data.error);
      const url = new URL("/cabinet/astrology", window.location.origin);
      url.searchParams.set("tab", "compatibility");
      url.searchParams.set("invite", data.token);
      setInviteUrl(url.toString());
      setSelectedId(data.record.id);
      setInvitePartnerLabel("");
      setNotice("Приглашение создано. Отправьте приватную ссылку второму человеку.");
      await navigator.clipboard.writeText(url.toString()).catch(() => undefined);
      await loadRecords();
    } catch (reason) {
      setError(errorMessage(reason instanceof Error ? reason.message : undefined));
    } finally {
      setBusy(null);
    }
  };

  const acceptInvite = async () => {
    if (!inviteToken) return;
    if (!participantConsent) {
      setError("Подтвердите согласие на использование данных рождения из профиля.");
      return;
    }
    setBusy("accept");
    setError("");
    try {
      const response = await fetch(
        `/api/natal-chart/compatibility/token/${encodeURIComponent(inviteToken)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participantLabel: participantLabel || undefined,
            participantConsentAcknowledged: true,
          }),
        }
      );
      const data = await responseJson<{ record?: CompatibilityRecord; error?: string }>(response);
      if (!response.ok || !data.record) throw new Error(data.error);
      setInviteRecord(data.record);
      setSelectedId(data.record.id);
      setParticipantConsent(false);
      setNotice("Ваши натальные карты сопоставлены. Инициатор может заказать полный отчёт.");
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      url.searchParams.set("tab", "compatibility");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      await loadRecords();
    } catch (reason) {
      setError(errorMessage(reason instanceof Error ? reason.message : undefined));
    } finally {
      setBusy(null);
    }
  };

  const generate = async (record: CompatibilityRecord) => {
    setBusy("generate");
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/natal-chart/compatibility/${encodeURIComponent(record.id)}/generate`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aiDataUseAcknowledged: true, async: true }),
        }
      );
      let data = await responseJson<{
        record?: CompatibilityRecord;
        error?: string;
        balance?: number;
        cost?: number;
        jobId?: string;
      }>(response);
      if (response.status === 202 && data.jobId) {
        setNotice("Отчёт поставлен в очередь. Обычно это занимает 1–3 минуты; страницу можно обновить.");
        data = await waitForCompatibilityJob(data.jobId) as typeof data;
      }
      if (response.status === 402) {
        openPaywall({
          currentBalance: data.balance ?? 0,
          requiredRunes: data.cost ?? cost("SYNASTRY_REPORT"),
        });
        return;
      }
      if (response.status === 429) {
        showRateLimit("natal_compatibility_generate", Number(response.headers.get("retry-after")) || undefined);
        return;
      }
      if (!response.ok || !data.record) throw new Error(data.error);
      setSelectedId(data.record.id);
      setNotice("Полный отчёт совместимости готов.");
      await loadRecords();
    } catch (reason) {
      setError(errorMessage(reason instanceof Error ? reason.message : undefined));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (record: CompatibilityRecord) => {
    if (!window.confirm("Удалить отчёт совместимости? Руны не возвращаются, приватные ссылки будут отозваны.")) return;
    setBusy("delete");
    setError("");
    try {
      const response = await fetch(`/api/natal-chart/compatibility/${encodeURIComponent(record.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await responseJson<{ deleted?: boolean; error?: string }>(response);
      if (!response.ok || !data.deleted) throw new Error(data.error);
      setSelectedId(null);
      setNotice("Отчёт удалён, приватные ссылки отозваны.");
      await loadRecords();
    } catch (reason) {
      setError(errorMessage(reason instanceof Error ? reason.message : undefined));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-rose-300/15 bg-gradient-to-br from-rose-400/[0.08] via-black/25 to-violet-500/[0.08]">
        <div className="p-5 sm:p-7">
          <p className="text-[10px] uppercase tracking-[.2em] text-rose-200/55">
            Синастрия и композит · отдельный отчёт
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white sm:text-3xl">
            Совместимость по двум натальным картам
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
            Сравните коммуникацию, эмоциональную связь, притяжение, устойчивость и потенциал
            роста. Расчёт колёс бесплатный; полный отчёт создаётся отдельно за{" "}
            {cost("SYNASTRY_REPORT")} ᚢ.
          </p>
        </div>
      </section>

      {error ? <p className="rounded-xl border border-rose-400/25 bg-rose-400/[0.08] p-4 text-sm text-rose-200" role="alert">{error}</p> : null}
      {notice ? <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4 text-sm text-emerald-200" role="status">{notice}</p> : null}

      {inviteRecord && inviteToken ? (
        <section className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.04] p-5">
          <p className="text-xs uppercase tracking-wide text-rose-200/60">Приватное приглашение</p>
          <h3 className="mt-2 font-display text-xl text-white">
            {inviteRecord.ownerLabel} приглашает вас сравнить натальные карты
          </h3>
          {inviteRecord.status === "pending" ? (
            <>
              <p className="mt-2 text-sm leading-6 text-white/50">
                Используются данные рождения из вашего профиля.
              </p>
              <input
                value={participantLabel}
                onChange={(event) => setParticipantLabel(event.target.value)}
                placeholder="Ваше имя в отчёте"
                className="ui-input mt-4 w-full max-w-sm"
              />
              <label className="mt-4 flex max-w-2xl items-start gap-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.04] p-3 text-xs leading-5 text-white/55">
                <input type="checkbox" className="mt-0.5 accent-rose-300" checked={participantConsent}
                  onChange={(event) => setParticipantConsent(event.target.checked)} />
                Подтверждаю использование данных рождения из моего профиля для этого расчёта. Инициатор увидит только результат совместимости, а не исходные данные профиля.
              </label>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" disabled={busy !== null || !participantConsent} onClick={() => void acceptInvite()}
                  className="btn-luxe btn-luxe--md btn-luxe--gold">
                  {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Принять приглашение
                </button>
                <Link href="/cabinet" className="btn-luxe btn-luxe--md btn-luxe--ghost">
                  Проверить данные профиля
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-emerald-200/70">Приглашение принято. Расчёт доступен ниже.</p>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/[0.06] p-5">
          <h3 className="font-display text-xl font-semibold">Новая совместимость</h3>
          <div className="mt-4 flex gap-2" role="tablist" aria-label="Способ добавления второго человека">
            <button type="button" role="tab" aria-selected={mode === "manual"} onClick={() => setMode("manual")}
              className={`min-h-10 rounded-xl px-4 text-sm ${mode === "manual" ? "bg-rose-300/15 text-rose-100 ring-1 ring-rose-300/25" : "bg-white/[0.04] text-white/50"}`}>
              Ввести данные
            </button>
            <button type="button" role="tab" aria-selected={mode === "invite"} onClick={() => setMode("invite")}
              className={`min-h-10 rounded-xl px-4 text-sm ${mode === "invite" ? "bg-rose-300/15 text-rose-100 ring-1 ring-rose-300/25" : "bg-white/[0.04] text-white/50"}`}>
              Пригласить человека
            </button>
          </div>
        </div>
        <div className="p-5">
          {mode === "manual" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя второго человека">
                <input className="ui-input w-full" value={manual.partnerLabel}
                  onChange={(event) => setManual((value) => ({ ...value, partnerLabel: event.target.value }))}
                  placeholder="Например, Алексей" />
              </Field>
              <Field label="Дата рождения">
                <input type="date" className="ui-input w-full" value={manual.birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setManual((value) => ({ ...value, birthDate: event.target.value }))} />
              </Field>
              <Field label="Время рождения">
                <input type="time" className="ui-input w-full" value={manual.birthTime}
                  disabled={!manual.timeKnown}
                  onChange={(event) => setManual((value) => ({ ...value, birthTime: event.target.value }))} />
                <label className="mt-2 flex items-center gap-2 text-xs text-white/45">
                  <input type="checkbox" checked={!manual.timeKnown}
                    onChange={(event) => setManual((value) => ({
                      ...value,
                      timeKnown: !event.target.checked,
                      birthTime: event.target.checked ? "" : value.birthTime,
                    }))} />
                  Время неизвестно
                </label>
              </Field>
              <Field label="Город рождения">
                <div className="relative">
                <input className="ui-input w-full" value={manual.birthCity}
                  onChange={(event) => {
                    const birthCity = event.target.value;
                    setManual((value) => ({ ...value, birthCity }));
                    setCitySelected(false);
                    setCityLookupOpen(birthCity.trim().length >= 2);
                  }}
                  onFocus={() => {
                    if (manual.birthCity.trim().length >= 2) setCityLookupOpen(true);
                  }}
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={cityLookupOpen}
                  aria-controls="compatibility-city-suggestions"
                  placeholder="Начните вводить город по-русски или латиницей" />
                {cityLookupOpen ? <div id="compatibility-city-suggestions" role="listbox"
                  className="lux-scroll absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-white/15 bg-[#151019] p-1 shadow-2xl">
                  {cityLookupLoading ? <p className="px-3 py-2 text-xs text-white/45">Ищем города…</p> : null}
                  {!cityLookupLoading && citySuggestions.map((city) => <button type="button" role="option"
                    key={`${city.label}-${city.latitude}-${city.longitude}`}
                    aria-selected={manual.birthCity === city.label}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => selectCity(city)}
                    className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-white/75 transition hover:bg-rose-300/10 hover:text-rose-100">
                    {city.label}
                  </button>)}
                  {!cityLookupLoading && !citySuggestions.length ? <p className="px-3 py-2 text-xs leading-5 text-white/45">Город не найден. Попробуйте другое написание, например «Москва» или «Санкт-Петербург».</p> : null}
                </div> : null}
                </div>
                <p className={`mt-2 text-xs ${citySelected ? "text-emerald-200/65" : "text-white/40"}`}>
                  {citySelected ? "Город выбран: часовой пояс и координаты будут проверены." : "Выберите вариант из подсказок — свободный текст не используется для расчёта."}
                </p>
              </Field>
              <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-4 text-xs leading-5 text-white/50">
                <input type="checkbox" required className="mt-1" checked={manualConsent}
                  onChange={(event) => setManualConsent(event.target.checked)} />
                Я подтверждаю, что имею право использовать эти данные для личного расчёта.
                Исходные данные второго человека не сохраняются после построения синастрии.
              </label>
              <div className="sm:col-span-2">
                <button type="button" disabled={busy !== null} onClick={() => void createManual()}
                  className="btn-luxe btn-luxe--md btn-luxe--gold">
                  {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Рассчитать совместимость
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm leading-6 text-white/50">
                Второй человек получит приватную ссылку, войдёт в свой аккаунт и сам подтвердит
                использование данных рождения из профиля.
              </p>
              <Field label="Имя второго человека" className="mt-4 max-w-md">
                <input className="ui-input w-full" value={invitePartnerLabel}
                  onChange={(event) => setInvitePartnerLabel(event.target.value)}
                  placeholder="Имя в приглашении" />
              </Field>
              <button type="button" disabled={busy !== null} onClick={() => void createInvite()}
                className="btn-luxe btn-luxe--md btn-luxe--gold mt-4">
                {busy === "invite" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Создать приглашение
              </button>
              {inviteUrl ? <div className="mt-4 flex flex-col gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] p-4 sm:flex-row sm:items-center">
                <input readOnly value={inviteUrl} className="ui-input min-w-0 flex-1 text-xs" />
                <button type="button" onClick={() => void navigator.clipboard.writeText(inviteUrl)}
                  className="btn-luxe btn-luxe--sm btn-luxe--ghost">
                  <Copy className="h-4 w-4" /> Копировать
                </button>
              </div> : null}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025]">
        <div className="border-b border-white/[0.06] p-5">
          <h3 className="font-display text-xl font-semibold">Мои совместимости</h3>
          <p className="mt-1 text-xs text-white/40">Расчёты и купленные отчёты остаются доступны здесь.</p>
        </div>
        <div className="p-5">
          {loading ? <p className="flex items-center gap-2 text-sm text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем…</p> : null}
          {!loading && !records.length ? <p className="text-sm text-white/40">Сохранённых совместимостей пока нет.</p> : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {records.map((record) => (
              <button key={record.id} type="button" onClick={() => setSelectedId(record.id)}
                className={`rounded-xl border p-4 text-left transition ${selectedId === record.id ? "border-rose-300/30 bg-rose-300/[0.08]" : "border-white/8 bg-black/15 hover:border-white/15"}`}>
                <p className="text-sm font-medium text-white">{record.ownerLabel} и {record.partnerLabel}</p>
                <p className="mt-1 text-xs text-white/40">{STATUS_LABELS[record.status]} · {new Date(record.createdAt).toLocaleDateString("ru-RU")}</p>
                {record.synastry ? <p className="mt-3 text-2xl font-semibold text-rose-100">{record.synastry.overallScore}<span className="text-xs font-normal text-white/35"> / 100</span></p> : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      {selected ? <CompatibilityViewer
        record={selected}
        isOwner={isOwner}
        cost={cost("SYNASTRY_REPORT")}
        busy={busy}
        onGenerate={() => void generate(selected)}
        onDelete={() => void remove(selected)}
      /> : null}
    </div>
  );
}

function CompatibilityViewer({
  record,
  isOwner,
  cost,
  busy,
  onGenerate,
  onDelete,
}: {
  record: CompatibilityRecord;
  isOwner: boolean;
  cost: number;
  busy: string | null;
  onGenerate: () => void;
  onDelete: () => void;
}) {
  const synastry = record.synastry;
  const [aiDataConsent, setAiDataConsent] = useState(false);
  const evidenceById = new Map([
    ...(record.evidence?.dimensions ?? []).map((item) => [`dimension:${item.key}`, item.label] as const),
    ...(record.evidence?.crossAspects ?? []).map((item) => [item.id, item.label] as const),
  ]);
  const focusEvidence = (id: string) => {
    const element = document.getElementById(`compatibility-evidence-${id}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.focus({ preventScroll: true });
  };
  if (record.status === "expired") {
    return <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-5 sm:p-7">
      <p className="text-[10px] uppercase tracking-[.18em] text-amber-200/60">Срок истёк</p>
      <h3 className="mt-2 font-display text-2xl text-white">{record.ownerLabel} и {record.partnerLabel}</h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">Это незавершённое приглашение больше нельзя принять или использовать. Создайте новое приглашение, чтобы оба участника подтвердили актуальные данные.</p>
      <p className="mt-3 text-xs text-white/40">Истёк: {new Date(record.expiresAt).toLocaleString("ru-RU")}</p>
      {isOwner ? <button type="button" disabled={busy !== null} onClick={onDelete}
        className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-300/15 px-3 text-xs text-rose-200/70 disabled:opacity-50">
        <Trash2 className="h-4 w-4" /> Удалить запись
      </button> : null}
    </section>;
  }
  return <section className="rounded-2xl border border-rose-300/15 bg-black/25 p-5 sm:p-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <p className="text-[10px] uppercase tracking-[.18em] text-rose-200/50">{STATUS_LABELS[record.status]}</p>
        <h3 className="mt-2 font-display text-2xl text-white">{record.ownerLabel} и {record.partnerLabel}</h3>
      </div>
      {synastry ? <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.06] px-5 py-3 text-center">
        <p className="text-3xl font-semibold text-rose-100">{synastry.overallScore}</p>
        <p className="text-[10px] uppercase tracking-wide text-white/35">общий индекс</p>
      </div> : null}
    </div>

    {record.status === "pending" ? <p className="mt-5 text-sm text-white/45">Ожидаем подтверждения второго участника.</p> : null}
    {synastry ? <>
      <p className="mt-4 max-w-3xl text-xs leading-5 text-white/45">Индекс — ориентир по рассчитанным аспектам, а не оценка людей или прогноз отношений. Баллы по сферам показывают, где в этой методике больше согласующихся или напряжённых факторов.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {synastry.dimensions.map((dimension) => <article id={`compatibility-evidence-dimension:${dimension.key}`} tabIndex={-1} key={dimension.key} className="rounded-xl border border-white/8 bg-white/[0.025] p-3 focus:ring-2 focus:ring-rose-300/50">
          <p className="text-xs text-white/55">{dimension.label}</p>
          <p className="mt-2 text-lg font-medium text-rose-100">{dimension.index}/100</p>
          <p className="text-[10px] text-white/35">{dimension.band}</p>
        </article>)}
      </div>
      {record.evidence?.crossAspects.length ? <details className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-3">
        <summary className="cursor-pointer text-xs text-white/60">Рассчитанные межкартные аспекты ({record.evidence.crossAspects.length})</summary>
        <div className="mt-3 space-y-2">{record.evidence.crossAspects.map((aspect) => <p id={`compatibility-evidence-${aspect.id}`} tabIndex={-1} key={aspect.id} className="text-xs leading-5 text-white/50 focus:ring-2 focus:ring-rose-300/50">{aspect.label} · орб {aspect.orb.toFixed(2)}°</p>)}</div>
      </details> : null}
      {synastry.chartA?.western && synastry.chartB?.western ? <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <NatalSynastryWheel chartA={synastry.chartA.western} chartB={synastry.chartB.western}
          crossAspects={synastry.crossAspects} labelA={record.ownerLabel} labelB={record.partnerLabel} />
        <CompositeWheel composite={synastry.composite} />
      </div> : null}
    </> : null}

    {record.report ? <div className="mt-7 space-y-4">
      <h4 className="font-display text-xl text-amber-50">Персональный отчёт</h4>
      {record.report.sections.map((section) => <article key={section.key} className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
        <h5 className="font-display text-lg text-rose-50">{section.title}</h5>
        <div className="mt-3 space-y-3">{section.claims.map((claim, index) =>
          <div key={`${section.key}-${index}`}><p className="text-sm leading-7 text-white/65">{claim.text}</p>
          {claim.evidenceIds?.length ? <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="text-[10px] uppercase tracking-wide text-white/30">Основано на</span>{claim.evidenceIds.map((id) => <button type="button" key={id} onClick={() => focusEvidence(id)} className="rounded-full border border-rose-300/20 bg-rose-300/[0.07] px-2 py-1 text-[11px] text-rose-100/75 hover:bg-rose-300/[0.13]">{evidenceById.get(id) ?? id}</button>)}</div> : null}</div>
        )}</div>
      </article>)}
      <p className="text-xs leading-5 text-white/35">{record.report.disclaimer}</p>
      <div className="flex flex-wrap gap-3">
        <Link href={`/cabinet/astrology/compatibility/${record.id}/print`} className="btn-luxe btn-luxe--sm btn-luxe--ghost">Печать / PDF</Link>
        {isOwner ? <button type="button" disabled={busy !== null} onClick={onDelete}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-300/15 px-3 text-xs text-rose-200/70 disabled:opacity-50">
          <Trash2 className="h-4 w-4" /> Удалить
        </button> : null}
      </div>
      {isOwner ? <ReportShareControls reportKind="compatibility" reportId={record.id} requireThirdPartyConsent /> : null}
    </div> : record.status === "ready" && isOwner ? <div className="mt-7 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-5">
      <h4 className="font-display text-xl text-amber-50">Получить полный разбор</h4>
      <p className="mt-2 text-sm leading-6 text-white/50">Свяжем рассчитанные аспекты в понятный отчёт по семи сферам. Каждое утверждение опирается на показанные данные.</p>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-white/55">
        <input type="checkbox" className="mt-0.5 accent-amber-300" checked={aiDataConsent} onChange={(event) => setAiDataConsent(event.target.checked)} />
        Подтверждаю передачу только рассчитанных аспектов внешней языковой модели для создания отчёта. Исходные данные рождения обоих участников не передаются.
      </label>
      <button type="button" disabled={busy !== null || !aiDataConsent} onClick={onGenerate}
        className="btn-luxe btn-luxe--md btn-luxe--gold mt-4 disabled:opacity-50">
        {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Получить полный отчёт · {cost} ᚢ
      </button>
    </div> : record.status === "ready" ? <p className="mt-6 text-sm text-white/45">Расчёт готов. Полный отчёт может заказать инициатор приглашения.</p> : null}
  </section>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={className}><span className="mb-1 block text-xs text-white/45">{label}</span>{children}</label>;
}
