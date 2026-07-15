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
import type { CompatibilityReport } from "@/lib/natal/compatibility-report";
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

function errorMessage(code?: string): string {
  const messages: Record<string, string> = {
    chart_unavailable: "Сначала заполните дату и город рождения в профиле.",
    partner_chart_unavailable: "Не удалось рассчитать карту второго человека. Проверьте данные.",
    charts_not_ready: "Сначала нужны обе натальные карты.",
    generation_in_progress: "Отчёт уже создаётся. Подождите немного.",
    ai_data_use_acknowledgement_required: "Подтвердите передачу рассчитанных данных для AI-отчёта.",
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
  const [aiAcknowledged, setAiAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"create" | "invite" | "accept" | "generate" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);

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
    if (query.length < 2) {
      setCitySuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/natal-chart/places?q=${encodeURIComponent(query)}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then((response) => responseJson<{
          places?: Array<{ label: string }>;
        }>(response))
        .then((data) => setCitySuggestions((data.places ?? []).map((item) => item.label).slice(0, 8)))
        .catch(() => setCitySuggestions([]));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [manual.birthCity]);

  const selected = records.find((item) => item.id === selectedId) ?? null;
  const isOwner = selected?.ownerUserId === user?.profileUserId;

  const createManual = async () => {
    if (!manual.partnerLabel.trim() || !manual.birthDate || !manual.birthCity.trim()) {
      setError("Укажите имя, дату и город рождения второго человека.");
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
      setNotice("Ваши натальные карты сопоставлены. Инициатор может заказать полный отчёт.");
      await loadRecords();
    } catch (reason) {
      setError(errorMessage(reason instanceof Error ? reason.message : undefined));
    } finally {
      setBusy(null);
    }
  };

  const generate = async (record: CompatibilityRecord) => {
    if (!aiAcknowledged) {
      setError("Подтвердите создание AI-отчёта по рассчитанным данным.");
      return;
    }
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
          body: JSON.stringify({ aiDataUseAcknowledged: true }),
        }
      );
      const data = await responseJson<{
        record?: CompatibilityRecord;
        error?: string;
        balance?: number;
        cost?: number;
      }>(response);
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
            роста. Расчёт колёс бесплатный; проверяемый AI-отчёт создаётся отдельно за{" "}
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
                Используются данные рождения из вашего профиля. Вы явно подтверждаете
                сопоставление карт; исходные дата, время и координаты не попадут в AI-отчёт.
              </p>
              <input
                value={participantLabel}
                onChange={(event) => setParticipantLabel(event.target.value)}
                placeholder="Ваше имя в отчёте"
                className="ui-input mt-4 w-full max-w-sm"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" disabled={busy !== null} onClick={() => void acceptInvite()}
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
                <input className="ui-input w-full" value={manual.birthCity} list="compatibility-cities"
                  onChange={(event) => setManual((value) => ({ ...value, birthCity: event.target.value }))}
                  placeholder="Начните вводить город" />
                <datalist id="compatibility-cities">
                  {citySuggestions.map((city) => <option value={city} key={city} />)}
                </datalist>
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
        aiAcknowledged={aiAcknowledged}
        onAcknowledged={setAiAcknowledged}
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
  aiAcknowledged,
  onAcknowledged,
  onGenerate,
  onDelete,
}: {
  record: CompatibilityRecord;
  isOwner: boolean;
  cost: number;
  busy: string | null;
  aiAcknowledged: boolean;
  onAcknowledged: (value: boolean) => void;
  onGenerate: () => void;
  onDelete: () => void;
}) {
  const synastry = record.synastry;
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
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {synastry.dimensions.map((dimension) => <article key={dimension.key} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
          <p className="text-xs text-white/55">{dimension.label}</p>
          <p className="mt-2 text-lg font-medium text-rose-100">{dimension.index}/100</p>
          <p className="text-[10px] text-white/35">{dimension.band}</p>
        </article>)}
      </div>
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
          <p key={`${section.key}-${index}`} className="text-sm leading-7 text-white/65">{claim.text}</p>
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
      <p className="mt-2 text-sm leading-6 text-white/50">AI свяжет рассчитанные аспекты в понятный отчёт по семи сферам. Каждое утверждение будет опираться на показанные данные.</p>
      <label className="mt-4 flex items-start gap-3 text-xs leading-5 text-white/50">
        <input type="checkbox" className="mt-1" checked={aiAcknowledged} onChange={(event) => onAcknowledged(event.target.checked)} />
        Я подтверждаю создание отчёта. Во внешнюю модель передаются только рассчитанные аспекты и индексы, без дат, времени, города и координат рождения.
      </label>
      <button type="button" disabled={busy !== null || !aiAcknowledged} onClick={onGenerate}
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
