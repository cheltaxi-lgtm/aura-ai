"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import { BRAND_LOGO_BREADCRUMB } from "@/lib/brand";
import { BRAND_NAME } from "@/lib/brand";
import {
  AlertTriangle, Archive, CalendarClock, CheckCircle2, Compass,
  HeartHandshake, Loader2, Orbit, RefreshCw, ScrollText, Settings, Sparkles, Star, Trash2,
} from "lucide-react";
import NatalChartWheel from "./NatalChartWheel";
import ReportShareControls from "./ReportShareControls";
import NatalCompatibility from "./NatalCompatibility";
import NatalSettings from "./NatalSettings";
import { VedicChartPair, VimshottariTimeline } from "./VedicCharts";
import { AstrologyGuide, ExplainTerm, PanelBlock, PersonalMeaning, SectionIntroduction } from "./AstrologyGuide";
import { usePaywall } from "@/contexts/PaywallContext";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { navigateToBirthProfileOnboarding } from "@/lib/app-shell-nav";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { toParagraphs } from "@/lib/format-paragraphs";
import {
  aspectRows, bigThree, methodology, midpointRows, patternRows,
  positionRows, matchesCurrentChart, type NatalChartPayload,
} from "@/lib/natal/presentation";
import { evidenceAnchorId } from "@/lib/natal/evidence-anchor";
import {
  russianGrahaLabel, russianPlanetLabel, russianSignLabel,
  TIMING_CATEGORY_LABELS, TIMING_SOURCE_LABELS,
} from "@/lib/natal/labels";
import type { NatalTradition } from "@/lib/natal/types";
import type { NatalEvidence } from "@/lib/natal/evidence";
import { isNatalReport, type NatalReport } from "@/lib/natal/report";
import type { VedicChart } from "@/lib/natal/vedic";
import type {
  PersonalTimingResult, TimingCategory, TimingEvent, TimingHorizon,
} from "@/lib/natal/timing";
import {
  explainAspect, explainDasha, explainGraha, explainMidpoint, explainPattern, explainVedicHouse,
  explainPosition, NATAL_GUIDES,
} from "@/lib/natal/explainers";

type Tab = "overview" | "western" | "jyotish" | "timing" | "compatibility" | "reports" | "settings";
type Report = {
  id: string; tradition: NatalTradition; reportType: string; content: string;
  runeCost: number | null; createdAt: string; engineVersion: string; ephemeris: string;
  structuredData: NatalReport | null;
  evidenceRefs: NatalEvidence[] | null;
  birthFingerprint: string;
};
type FreshReport = {
  text: string;
  report: NatalReport | null;
  evidence: NatalEvidence[];
};

const NATAL_MUTATION_TIMEOUT_MS = 240_000;

type NatalMutationError = {
  error?: string;
  code?: string;
  balance?: number;
  cost?: number;
  requiredRunes?: number;
  action?: string;
  retryAfter?: number;
  retryAfterSec?: number;
};

function isAbortError(reason: unknown): boolean {
  return (
    (reason instanceof DOMException && reason.name === "AbortError") ||
    (reason instanceof Error && reason.name === "AbortError")
  );
}

const TABS: Array<{ id: Tab; label: string; icon: typeof Star }> = [
  { id: "overview", label: "Обзор", icon: Star },
  { id: "western", label: "Западная", icon: Orbit },
  { id: "jyotish", label: "Джйотиш", icon: Compass },
  { id: "timing", label: "Периоды", icon: CalendarClock },
  { id: "compatibility", label: "Совместимость", icon: HeartHandshake },
  { id: "reports", label: "Отчёты", icon: ScrollText },
  { id: "settings", label: "Настройки", icon: Settings },
];

async function responseJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new Error(`Сервер вернул некорректный ответ (${response.status})`); }
}

async function waitForNatalJob(jobId: string): Promise<Record<string, unknown>> {
  const storageKey = "aura:natal-active-job";
  let terminal = false;
  window.localStorage.setItem(storageKey, jobId);
  try {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const job = await responseJson<{
        status?: string;
        result?: Record<string, unknown>;
        error?: string;
      }>(response);
      if (!response.ok) throw new Error(job.error || "Не удалось проверить статус генерации.");
      if (job.status === "completed") {
        terminal = true;
        return job.result ?? {};
      }
      if (job.status === "failed") {
        terminal = true;
        throw new Error(job.error || "Генерация не завершилась. Оплата возвращена.");
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
    }
    throw new Error("Генерация ещё выполняется. Её статус сохранён, обновите страницу позже.");
  } finally {
    if (terminal) window.localStorage.removeItem(storageKey);
  }
}

async function fetchRobust(input: RequestInfo | URL, init?: RequestInit, retries = 2): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (response.status >= 500 && attempt < retries) {
        await new Promise((resolve) => window.setTimeout(resolve, 450 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (reason) {
      lastError = reason;
      if (attempt < retries) {
        await new Promise((resolve) => window.setTimeout(resolve, 450 * (attempt + 1)));
        continue;
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Сеть недоступна");
}

export default function AstrologyWorkspace() {
  const { openPaywall, showRateLimit } = usePaywall();
  const { cost } = useRuneConfig();
  const [tab, setTab] = useState<Tab>("overview");
  const [chart, setChart] = useState<NatalChartPayload | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [busy, setBusy] = useState<"recompute" | "forecast" | NatalTradition | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [freshReports, setFreshReports] = useState<Partial<Record<NatalTradition, FreshReport>>>({});

  const selectTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    if (nextTab !== "reports") url.searchParams.delete("report");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const openReportArchive = useCallback((reportId?: string) => {
    setTab("reports");
    setSelectedReportId(reportId ?? null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "reports");
    if (reportId) url.searchParams.set("report", reportId);
    else url.searchParams.delete("report");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetchRobust("/api/natal-chart/history?limit=100", { credentials: "include" });
      const data = await responseJson<{ reports?: Report[]; error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить историю");
      const nextReports = data.reports ?? [];
      setReports(nextReports);
      return nextReports;
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : "Не удалось загрузить историю");
      return [];
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadChart = useCallback(async (recompute = false) => {
    setError("");
    setNotice("");
    if (recompute) setBusy("recompute");
    try {
      const response = await fetchRobust(
        "/api/natal-chart",
        { method: recompute ? "POST" : "GET", credentials: "include" },
        recompute ? 0 : 2
      );
      const data = await responseJson<{ enabled?: boolean; chart?: NatalChartPayload | null; error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить карту рождения");
      setEnabled(data.enabled !== false);
      setChart(data.chart ?? null);
      if (recompute) {
        setNotice("Расчёт обновлён. Сохранённые платные отчёты остаются в истории версий.");
        void loadHistory();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка сети");
    } finally {
      setLoading(false);
      setBusy(null);
    }
  }, [loadHistory]);

  useEffect(() => {
    void loadChart();
    void loadHistory();
    const search = new URLSearchParams(window.location.search);
    const rawRequested = search.get("tab");
    const requested = (rawRequested === "relationships" ? "compatibility" : rawRequested) as Tab | null;
    const requestedReport = search.get("report");
    if (requested && TABS.some((item) => item.id === requested)) setTab(requested);
    else if (requestedReport) setTab("reports");
    setSelectedReportId(requestedReport);
  }, [loadChart, loadHistory]);

  useEffect(() => {
    const pendingJobId = window.localStorage.getItem("aura:natal-active-job");
    if (!pendingJobId) return;
    let active = true;
    setNotice("Восстанавливаем генерацию, начатую до обновления страницы…");
    void waitForNatalJob(pendingJobId)
      .then(async (result) => {
        if (!active) return;
        const nextReports = await loadHistory();
        if (!active) return;
        const reportId = typeof result.reportId === "string" ? result.reportId : null;
        const saved = reportId
          ? nextReports.find((report) => report.id === reportId)
          : nextReports[0];
        if (saved?.reportType.startsWith("forecast:")) selectTab("timing");
        else if (saved?.tradition === "vedic") selectTab("jyotish");
        else if (saved) selectTab("western");
        setSelectedReportId(saved?.id ?? null);
        setNotice("Генерация завершена. Результат показан в соответствующем разделе.");
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Не удалось восстановить генерацию.");
      });
    return () => {
      active = false;
    };
  }, [loadHistory, selectTab]);

  const focusEvidence = useCallback((target: string) => {
    const url = new URL(target, window.location.origin);
    const requested = url.searchParams.get("tab") as Tab | null;
    if (requested && TABS.some((item) => item.id === requested)) selectTab(requested);
    window.setTimeout(() => {
      if (!url.hash) return;
      const element = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      element?.focus({ preventScroll: true });
    }, 80);
  }, [selectTab]);

  const requestInterpretation = async (tradition: NatalTradition) => {
    if (!chart?.[tradition]) {
      setError("Сначала укажите дату и город рождения в настройках карты.");
      selectTab("settings");
      return;
    }
    setBusy(tradition);
    setError("");
    try {
      const response = await fetchWithTimeout("/api/natal-chart/interpretation", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradition, aiDataUseAcknowledged: true, async: true }),
        timeoutMs: NATAL_MUTATION_TIMEOUT_MS,
      });
      let data = await responseJson<NatalMutationError & {
        interpretation?: string; report?: NatalReport | null; evidence?: NatalEvidence[];
        jobId?: string;
      }>(response);
      if (response.status === 202 && data.jobId) {
        setNotice("Отчёт поставлен в очередь. Обычно это занимает 1–3 минуты; страницу можно обновить.");
        data = await waitForNatalJob(data.jobId) as typeof data;
      }
      if (response.status === 401 && data.code === "NEEDS_PROFILE") {
        navigateToBirthProfileOnboarding();
        return;
      }
      if (response.status === 402) {
        openPaywall({
          currentBalance: data.balance ?? 0,
          requiredRunes: data.requiredRunes ?? data.cost ?? cost("NATAL_READING"),
          onClose: () => void loadChart(),
        });
        return;
      }
      if (response.status === 429) {
        showRateLimit(data.action ?? "natal_chart_interpretation", data.retryAfter ?? data.retryAfterSec);
        return;
      }
      if (response.status === 409) {
        const stale = /измени|обновите|пересчитайте|неполн/i.test(data.error ?? "");
        if (stale) {
          setError(data.error || "Карта изменилась. Загружаем актуальный расчёт.");
          await loadChart();
        } else if (data.code === "CLAIM_BUSY") {
          setError(data.error || "Не удалось начать отчёт. Обновите страницу и попробуйте снова.");
        } else {
          setNotice(data.error || "Отчёт уже создаётся. Повторите попытку немного позже.");
        }
        return;
      }
      if (!response.ok) throw new Error(data.error || "Не удалось получить трактовку");
      if (!data.interpretation?.trim()) {
        throw new Error("Сервер не вернул текст отчёта. Оставайтесь в этой вкладке и повторите попытку.");
      }
      const nextEvidence = Array.isArray(data.evidence) ? data.evidence : [];
      setChart((previous) => previous ? {
        ...previous, interpretations: { ...previous.interpretations, [tradition]: data.interpretation },
      } : previous);
      setFreshReports((previous) => ({
        ...previous,
        [tradition]: {
          text: data.interpretation!,
          report: isNatalReport(data.report) ? data.report : null,
          evidence: nextEvidence,
        },
      }));
      setNotice(`${tradition === "western" ? "Западный" : "Ведический"} отчёт готов.`);
      const nextReports = await loadHistory();
      const saved = chart
        ? nextReports.find((report) =>
            report.tradition === tradition &&
            report.reportType === "interpretation" &&
            matchesCurrentChart(report, chart)
          )
        : undefined;
      if (saved) {
        setSelectedReportId(saved.id);
        selectTab(tradition === "western" ? "western" : "jyotish");
      }
    } catch (reason) {
      if (isAbortError(reason)) {
        const nextReports = await loadHistory();
        const saved = chart
          ? nextReports.find((report) =>
              report.tradition === tradition &&
              report.reportType === "interpretation" &&
              matchesCurrentChart(report, chart)
            )
          : undefined;
        if (saved) {
          setNotice(`${tradition === "western" ? "Западный" : "Ведический"} отчёт готов и показан в этой вкладке.`);
          setSelectedReportId(saved.id);
          selectTab(tradition === "western" ? "western" : "jyotish");
          return;
        }
        setError("Генерация заняла слишком много времени. Оставайтесь в этой вкладке или повторите попытку позже.");
      } else {
        setError(reason instanceof Error ? reason.message : "Ошибка сети");
      }
    } finally {
      setBusy(null);
    }
  };

  const requestForecast = async (horizon: TimingHorizon) => {
    if (!chart?.western) {
      setError("Сначала укажите дату и город рождения в настройках карты.");
      selectTab("settings");
      return;
    }
    setBusy("forecast");
    setError("");
    setNotice("");
    try {
      const response = await fetchWithTimeout("/api/natal-chart/forecast", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizon, aiDataUseAcknowledged: true, async: true }),
        timeoutMs: NATAL_MUTATION_TIMEOUT_MS,
      });
      let data = await responseJson<NatalMutationError & {
        forecast?: string; reportId?: string;
        jobId?: string;
      }>(response);
      if (response.status === 202 && data.jobId) {
        setNotice("Прогноз поставлен в очередь. Обычно это занимает 1–3 минуты; страницу можно обновить.");
        data = await waitForNatalJob(data.jobId) as typeof data;
      }
      if (response.status === 401 && data.code === "NEEDS_PROFILE") {
        navigateToBirthProfileOnboarding();
        return;
      }
      if (response.status === 402) {
        openPaywall({
          currentBalance: data.balance ?? 0,
          requiredRunes: data.requiredRunes ?? data.cost ?? cost("FORECAST_REPORT"),
        });
        return;
      }
      if (response.status === 429) {
        showRateLimit(data.action ?? "natal_forecast", data.retryAfter ?? data.retryAfterSec);
        return;
      }
      if (response.status === 409) {
        const stale = /измени|обновите|пересчитайте|неполн/i.test(data.error ?? "");
        if (stale) {
          setError(data.error || "Карта изменилась. Загружаем актуальный расчёт.");
          await loadChart();
        } else if (data.code === "CLAIM_BUSY") {
          setError(data.error || "Не удалось начать прогноз. Обновите страницу и попробуйте снова.");
        } else {
          setNotice(data.error || "Прогноз уже создаётся. Повторите попытку немного позже.");
        }
        return;
      }
      if (!response.ok) throw new Error(data.error || "Не удалось получить прогноз");
      if (!data.forecast?.trim() && !data.reportId) {
        throw new Error("Сервер не вернул прогноз. Оставайтесь во вкладке «Периоды» и повторите попытку.");
      }
      setNotice(`Персональный прогноз на ${horizon === 365 ? "1 год" : `${horizon} дней`} готов и показан ниже.`);
      const nextReports = await loadHistory();
      const reportId = data.reportId ?? (chart ? nextReports.find((report) =>
        report.reportType.startsWith(`forecast:${horizon}:`) && matchesCurrentChart(report, chart)
      )?.id : undefined);
      setSelectedReportId(reportId ?? null);
      selectTab("timing");
    } catch (reason) {
      if (isAbortError(reason)) {
        const nextReports = await loadHistory();
        const saved = chart
          ? nextReports.find((report) =>
              report.reportType.startsWith(`forecast:${horizon}:`) &&
              matchesCurrentChart(report, chart)
            )
          : undefined;
        if (saved) {
          setNotice(`Прогноз на ${horizon === 365 ? "1 год" : `${horizon} дней`} готов и показан в этой вкладке.`);
          setSelectedReportId(saved.id);
          selectTab("timing");
          return;
        }
        setError("Генерация заняла слишком много времени. Оставайтесь в этой вкладке или повторите попытку позже.");
      } else {
        setError(reason instanceof Error ? reason.message : "Ошибка сети");
      }
    } finally {
      setBusy(null);
    }
  };

  const deleteReport = async (report: Report) => {
    const kind = report.reportType.startsWith("forecast:")
      ? "прогноз"
      : report.tradition === "western" ? "западный отчёт" : "отчёт джйотиш";
    if (!window.confirm(`Удалить ${kind}? Руны не возвращаются, публичные ссылки будут отозваны. После удаления отчёт можно заказать заново.`)) {
      return;
    }
    setDeletingReportId(report.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/natal-chart/history/${encodeURIComponent(report.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await responseJson<{ deleted?: boolean; error?: string }>(response);
      if (response.status === 429) {
        showRateLimit("natal_report_delete", Number(response.headers.get("retry-after")) || undefined);
        return;
      }
      if (!response.ok || !data.deleted) throw new Error(data.error || "Не удалось удалить отчёт");
      if (report.reportType === "interpretation") {
        setFreshReports((previous) => {
          const next = { ...previous };
          delete next[report.tradition];
          return next;
        });
        await loadChart();
      }
      await loadHistory();
      if (selectedReportId === report.id) {
        setSelectedReportId(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("report");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
      setNotice("Отчёт удалён без возврата рун. Теперь можно заказать новую версию.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка сети");
    } finally {
      setDeletingReportId(null);
    }
  };

  if (loading) return <StateCard icon={Loader2} spin title="Строим астрологическое пространство" text="Загружаем карту, методологию и сохранённые отчёты…" />;
  if (enabled === false) return <StateCard icon={Star} title="Астрология временно недоступна" text="Раздел выключен в настройках платформы. Ваши профильные данные не изменены." />;
  if (!chart) return <StateCard icon={Compass} title="Данных для расчёта пока нет" text="Добавьте дату, город и, по возможности, точное время рождения в профиле." action={<button type="button" onClick={navigateToBirthProfileOnboarding} className="btn-neon inline-flex px-4 py-2 text-sm">Заполнить профиль</button>} />;

  const western = chart.western;
  const westernReport = chart.interpretations?.western ?? chart.interpretation;
  const vedicReport = chart.interpretations?.vedic;
  const currentWesternReport = reports.find((report) =>
    report.tradition === "western" &&
    report.reportType === "interpretation" &&
    matchesCurrentChart(report, chart)
  );
  const currentVedicReport = reports.find((report) =>
    report.tradition === "vedic" &&
    report.reportType === "interpretation" &&
    matchesCurrentChart(report, chart)
  );

  return (
    <main className="relative text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(245,158,11,.12),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(124,58,237,.11),transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8">
        <header className="rounded-3xl border border-amber-300/15 bg-black/35 p-5 backdrop-blur-xl sm:p-7">
          <nav className="flex flex-wrap items-center gap-2 text-xs text-white/50" aria-label="Навигация по сайту">
            <BrandLogo {...BRAND_LOGO_BREADCRUMB} />
            <span aria-hidden>·</span>
            <Link href="/cabinet" className="transition hover:text-amber-100">
              Кабинет
            </Link>
            <span aria-hidden>·</span>
            <span className="text-amber-100/75">Натальная карта</span>
          </nav>
          <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-[11px] uppercase tracking-[.25em] text-amber-300/55">{BRAND_NAME} · астрология</p>
              <h1 className="mt-2 font-display text-3xl font-semibold sm:text-5xl">Астрологическое пространство</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
                Западная карта, джйотиш, периоды и ваши платные отчёты — с прозрачной методологией и ограничениями расчёта.
              </p>
            </div>
            <button type="button" onClick={() => void loadChart(true)} disabled={busy !== null}
              title="Обновляет положения планет и транзиты. Платные отчёты не перегенерируются."
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-4 text-sm text-amber-100 transition hover:bg-amber-300/[0.13] disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${busy === "recompute" ? "animate-spin" : ""}`} aria-hidden /> Обновить расчёт
            </button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/50">
            {western ? bigThree(western, chart.timeKnown).map((item) => <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{item}</span>) : null}
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{chart.place?.label ?? "Место не указано"}</span>
            <span className={`rounded-full border px-3 py-1.5 ${chart.timeKnown ? "border-emerald-300/20 text-emerald-200/70" : "border-amber-300/25 text-amber-100/70"}`}>{chart.timeKnown ? "Точное время" : "Время неизвестно"}</span>
          </div>
        </header>

        <nav className="mt-5 flex snap-x gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/35 p-2" aria-label="Разделы карты">
          {TABS.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" onClick={() => selectTab(item.id)} aria-current={tab === item.id ? "page" : undefined}
              className={`flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-xl px-3.5 text-sm transition sm:flex-1 sm:justify-center ${tab === item.id ? "bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/25" : "text-white/45 hover:bg-white/[0.04] hover:text-white/75"}`}>
              <Icon className="h-4 w-4" aria-hidden /> {item.label}
            </button>;
          })}
        </nav>

        {error ? <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/[0.07] px-4 py-3 text-sm text-rose-200" role="alert">{error}</div> : null}
        {notice ? <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200/80" role="status">{notice}</div> : null}
        {!chart.timeKnown && <UnknownTimeWarning />}

        <div className="mt-5">
          {tab === "overview" && <Overview chart={chart} reports={reports} onTab={selectTab} />}
          {tab === "western" && (western ? <Western chart={chart} western={western} savedReport={currentWesternReport} freshReport={freshReports.western} fallbackText={westernReport} busy={busy} cost={cost("NATAL_READING")} onRequest={requestInterpretation} onEvidence={focusEvidence} onOpenArchive={() => openReportArchive(currentWesternReport?.id)} /> : <Unavailable title="Западный расчёт отсутствует" />)}
          {tab === "jyotish" && (chart.vedic ? <Jyotish chart={chart} vedic={chart.vedic} savedReport={currentVedicReport} freshReport={freshReports.vedic} fallbackText={vedicReport} busy={busy} cost={cost("NATAL_READING")} onRequest={requestInterpretation} onEvidence={focusEvidence} onOpenArchive={() => openReportArchive(currentVedicReport?.id)} /> : <Unavailable title="Расчёт джйотиш отсутствует" />)}
          {tab === "timing" && <Timing chart={chart} reports={reports} busy={busy} forecastCost={cost("FORECAST_REPORT")} onRequestForecast={requestForecast} onEvidence={focusEvidence} />}
          {tab === "compatibility" && <NatalCompatibility />}
          {tab === "reports" && <Reports chart={chart} reports={reports} loading={historyLoading} error={historyError} deletingReportId={deletingReportId} onDelete={deleteReport} onReload={loadHistory} onEvidence={focusEvidence} selectedReportId={selectedReportId} onSelectReport={setSelectedReportId} />}
          {tab === "settings" && <NatalSettings />}
        </div>
      </div>
    </main>
  );
}

function Overview({ chart, reports, onTab }: { chart: NatalChartPayload; reports: Report[]; onTab: (tab: Tab) => void }) {
  const positions = chart.western ? positionRows(chart.western, chart.timeKnown) : [];
  return <div className="grid gap-6 lg:grid-cols-3">
    <AstrologyGuide guide={NATAL_GUIDES.overview} className="lg:col-span-3" />
    <Panel className="lg:col-span-2" title="Ключевые положения" eyebrow="Западная карта">
      <SectionIntroduction title="Большая тройка">Солнце, Луна и ASC — удобная отправная точка. ASC показывается только при известном времени рождения.</SectionIntroduction>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {positions.slice(0, 12).map((position) => <button key={position.key} type="button" onClick={() => onTab("western")} className="rounded-xl border border-white/8 bg-white/[0.025] p-3 text-left transition hover:border-amber-300/20">
          <span className="text-lg text-amber-200">{position.glyph}</span>
          <span className="ml-2 text-sm font-medium">{position.name}</span>
          <span className="mt-1 block text-xs text-white/45">{position.sign} {position.degree == null ? "" : `${position.degree.toFixed(2)}°`}{position.retrograde ? " · ℞" : ""}</span>
        </button>)}
      </div>
    </Panel>
    <Panel title="Состояние пространства" eyebrow="Данные">
      <StatusLine label="Западная карта" ready={Boolean(chart.western)} />
      <StatusLine label="Джйотиш" ready={Boolean(chart.vedic)} />
      <StatusLine label="Точное время" ready={chart.timeKnown} />
      <StatusLine label="Сохранённые отчёты" ready={reports.length > 0} detail={String(reports.length)} />
      <div className="mt-4 flex flex-wrap gap-4">
        <button type="button" onClick={() => onTab("reports")} className="text-xs text-amber-200/70 hover:text-amber-100">Открыть отчёты →</button>
        <button type="button" onClick={() => onTab("compatibility")} className="text-xs text-rose-200/70 hover:text-rose-100">Сравнить две карты →</button>
      </div>
    </Panel>
    {chart.transits?.length ? <Panel className="lg:col-span-3" title="Актуальные транзиты" eyebrow="Периоды">
      <SectionIntroduction title="Текущие транзиты">Это рассчитанные положения небесных объектов сейчас относительно карты рождения. Они служат темами для наблюдения, а не утверждениями о будущих событиях.</SectionIntroduction>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{chart.transits.slice(0, 9).map((transit, index) => <article key={`${transit.kind}-${index}`} className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.04] p-3 text-xs leading-5 text-white/55">{transit.note}</article>)}</div>
    </Panel> : null}
  </div>;
}

function Western({ chart, western, savedReport, freshReport, fallbackText, busy, cost, onRequest, onEvidence, onOpenArchive }: {
  chart: NatalChartPayload;
  western: Record<string, unknown>;
  savedReport?: Report;
  freshReport?: FreshReport;
  fallbackText?: string;
  busy: string | null;
  cost: number;
  onRequest: (tradition: NatalTradition) => void;
  onEvidence: (target: string) => void;
  onOpenArchive: () => void;
}) {
  const positions = positionRows(western, chart.timeKnown);
  const aspects = aspectRows(western);
  const patterns = patternRows(western);
  const midpoints = midpointRows(western);
  const method = methodology(western, chart.engineVersion);
  return <div className="space-y-6">
    <AstrologyGuide guide={NATAL_GUIDES.western} />
    <ReportCard
      tradition="western"
      title="Персональный западный отчёт"
      text={savedReport?.content ?? freshReport?.text ?? fallbackText}
      report={savedReport?.structuredData ?? freshReport?.report}
      evidence={savedReport?.evidenceRefs ?? freshReport?.evidence}
      savedReport={savedReport}
      busy={busy}
      cost={cost}
      onRequest={onRequest}
      onEvidence={onEvidence}
      onOpenArchive={onOpenArchive}
    />
    <Panel title="Интерактивное колесо" eyebrow="Западная карта">
      <SectionIntroduction title="Колесо">Круг разделён на 12 знаков; при известном времени также видны дома. Линии между объектами — <ExplainTerm term="аспекты">геометрические углы между положениями; они не предсказывают результат.</ExplainTerm>.</SectionIntroduction>
      <div><NatalChartWheel western={western} timeKnown={chart.timeKnown} /></div>
    </Panel>
    <Panel title="Все тела и углы" eyebrow={`${positions.length} положений`}>
      <SectionIntroduction title="Положения">Планета — тема, знак — её символический стиль, дом — область опыта. Дом показывается только при точном времени.</SectionIntroduction>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{positions.map((position) => <details id={evidenceAnchorId("planet", position.key)} key={position.key} className="rounded-xl border border-white/8 bg-black/20 p-3 focus-within:ring-2 focus-within:ring-amber-300/50">
        <summary className="cursor-pointer list-none"><p className="font-medium"><span className="mr-2 text-lg text-amber-200">{position.glyph}</span>{position.name}{position.retrograde ? <span className="ml-2 text-rose-300">℞</span> : null}</p>
        <p className="mt-1 text-xs text-white/50">{position.sign} · {position.degree == null ? "градус не указан" : `${position.degree.toFixed(2)}°`}{position.house ? ` · ${position.house} дом` : ""}</p></summary>
        <PersonalMeaning>{explainPosition(position)}</PersonalMeaning>
      </details>)}</div>
    </Panel>
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Аспекты" eyebrow={`${aspects.length} рассчитано`}>
        <SectionIntroduction title="Аспекты и орб">Орб — отклонение от точного угла: это мера геометрии, а не силы характера.</SectionIntroduction>
        {aspects.length ? <ul className="max-h-[32rem] space-y-2 overflow-auto pr-1">{aspects.map((aspect) => {
          const stableKey = `${[aspect.firstKey, aspect.secondKey].sort().join(`-${aspect.type}-`)}`.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-");
          return <li id={evidenceAnchorId("aspect", stableKey)} tabIndex={-1} key={aspect.id} className="rounded-lg bg-white/[0.025] px-3 py-2 text-xs focus:ring-2 focus:ring-amber-300/50"><details><summary className="flex cursor-pointer justify-between gap-3"><span>{aspect.first} — <b className="font-medium text-amber-200/75">{aspect.label}</b> — {aspect.second}</span><span className="shrink-0 text-white/35">{aspect.nature} · {aspect.orb == null ? "орб —" : `${aspect.orb.toFixed(2)}°`}</span></summary><PersonalMeaning>{explainAspect(aspect)}</PersonalMeaning></details></li>;
        })}</ul> : <Empty text="Движок не вернул аспекты." />}
      </Panel>
      <div className="space-y-6">
        <Panel title="Конфигурации" eyebrow="Паттерны"><SectionIntroduction title="Паттерны">Это повторяющиеся геометрические рисунки из уже показанных аспектов.</SectionIntroduction>{patterns.length ? <div className="space-y-2">{patterns.map((pattern) => <article key={pattern.id} className="rounded-xl bg-violet-300/[0.05] p-3"><p className="text-sm font-medium text-violet-100">{pattern.label}</p><p className="mt-1 text-xs text-white/45">{pattern.planets.join(", ")}{pattern.note ? ` · ${pattern.note}` : ""}</p><PersonalMeaning>{explainPattern(pattern)}</PersonalMeaning></article>)}</div> : <Empty text="Устойчивые конфигурации не найдены или не предоставлены движком." />}</Panel>
        <Panel title="Мидпойнты" eyebrow={`${midpoints.length} точек`}><SectionIntroduction title="Мидпойнты">Математические середины между двумя положениями — дополнительный, а не обязательный слой чтения.</SectionIntroduction>{midpoints.length ? <div className="grid gap-2 sm:grid-cols-2">{midpoints.map((point) => <article key={point.id} className="rounded-lg bg-white/[0.025] p-2 text-xs text-white/55"><p>{point.pair} · {point.sign} {point.degree?.toFixed(2)}°</p><PersonalMeaning>{explainMidpoint(point)}</PersonalMeaning></article>)}</div> : <Empty text="Мидпойнты не предоставлены." />}</Panel>
      </div>
    </div>
    <Panel title="Методология и точность" eyebrow="Прозрачность">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Движок" value={method.engine} /><Metric label="Эфемериды" value={method.source} /><Metric label="Система домов" value={chart.timeKnown ? method.houses ?? "не указана" : "не рассчитывается"} /><Metric label="Зодиак" value={method.zodiac} /></div>
      <p className="mt-4 text-xs leading-5 text-white/45">Астрологическая интерпретация не является научным прогнозом. Градусы зависят от исходных данных, часового пояса и методики. {chart.computedAt ? `Расчёт: ${new Date(chart.computedAt).toLocaleString("ru-RU")}.` : ""}</p>
      {chart.warnings?.length ? <ul className="mt-3 space-y-1 text-xs text-amber-100/60">{chart.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul> : null}
    </Panel>
  </div>;
}

function Jyotish({ chart, vedic, savedReport, freshReport, fallbackText, busy, cost, onRequest, onEvidence, onOpenArchive }: {
  chart: NatalChartPayload;
  vedic: VedicChart;
  savedReport?: Report;
  freshReport?: FreshReport;
  fallbackText?: string;
  busy: string | null;
  cost: number;
  onRequest: (tradition: NatalTradition) => void;
  onEvidence: (target: string) => void;
  onOpenArchive: () => void;
}) {
  const moon = vedic.moonSign;
  return <div className="space-y-6">
    <AstrologyGuide guide={NATAL_GUIDES.jyotish} />
    <ReportCard
      tradition="vedic"
      title="Персональный отчёт джйотиш"
      text={savedReport?.content ?? freshReport?.text ?? fallbackText}
      report={savedReport?.structuredData ?? freshReport?.report}
      evidence={savedReport?.evidenceRefs ?? freshReport?.evidence}
      savedReport={savedReport}
      busy={busy}
      cost={cost}
      onRequest={onRequest}
      onEvidence={onEvidence}
      onOpenArchive={onOpenArchive}
    />
    <Panel title="Джйотиш" eyebrow="Сидерический зодиак · Lahiri (Chitrapaksha)">
      <SectionIntroduction title="Основа джйотиш">Это другой способ разметить те же астрономические положения: используется сидерический зодиак. Термины ниже раскрываются по одному, чтобы не нужно было знать традицию заранее.</SectionIntroduction>
      <PanelBlock>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Источник расчёта" value="Астрологический расчётный движок" />
        <Metric label="Айанамша" value={`${vedic.ayanamsa.system} · ${vedic.ayanamsa.formatted}`} />
        <Metric label="Лунный раши" value={`${moon.rashi.symbol} ${moon.rashi.name} (${moon.rashi.westernName})`} />
        <Metric label="Накшатра Луны" value={`${moon.nakshatra.name} · пада ${moon.nakshatra.pada} · ${russianGrahaLabel(moon.nakshatra.lord)}`} />
      </div>
      <p className="text-xs leading-5 text-white/45">
        D1 — основная карта. D9 (Навамша) — производная карта: знак делится на девять равных частей. Здесь показан только этот расчёт, без йог, достоинств и оценок силы планет.
      </p>
      <p className="text-xs leading-5 text-amber-100/55">
        Астрологические выводы не являются научным прогнозом. Точность зависит от даты, часового пояса,
        координат и времени рождения. {chart.timeKnown ? "Лагна рассчитана по указанному времени." : "Без точного времени лагна, дома и асцендент D9 исключены."}
      </p>
      </PanelBlock>
    </Panel>
    <Panel title="Грахи, раши и накшатры" eyebrow="Личные рассчитанные положения">
      <SectionIntroduction title="Что здесь видно">Граха — традиционный небесный показатель. Раши — знак. Накшатра — участок пути Луны, а пада — его четверть. Раху и Кету — расчётные лунные узлы, не физические планеты.</SectionIntroduction>
      <PanelBlock>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.keys(vedic.positions).flatMap((rawKey) => {
          const text = explainGraha(vedic, rawKey as keyof typeof vedic.positions);
          return text ? [<article key={rawKey} className="rounded-xl border border-violet-200/10 bg-violet-300/[0.035] p-3"><p className="text-sm text-violet-100">{russianGrahaLabel(rawKey)}</p><PersonalMeaning>{text}</PersonalMeaning></article>] : [];
        })}
      </div>
      {vedic.houses ? <div className="flex flex-col gap-4 border-t border-white/8 pt-4"><SectionIntroduction title="Дома от лагны">Номера домов доступны, только когда известны точные время и место рождения.</SectionIntroduction><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(vedic.houses).map(([number, house]) => house ? <article key={number} className="rounded-xl border border-violet-200/10 bg-violet-300/[0.035] p-3"><p className="text-sm text-violet-100">Дом {number} · {house.sign.name}</p><PersonalMeaning>{explainVedicHouse(Number(number), house.sign.name, house.planets.length)}</PersonalMeaning></article> : null)}</div></div> : null}
      </PanelBlock>
    </Panel>
    <VedicChartPair chart={vedic} />
    <Panel title="D1, D9 и текущая даша" eyebrow="Дополнительный контекст">
      <SectionIntroduction title="D1 и D9">D1 — основная карта раши; D9/Навамша получается делением каждого раши на девять частей. Без точного времени дома и лагна не выводятся, а асцендент D9 исключён.</SectionIntroduction>
      <PersonalMeaning>{explainDasha(vedic)}</PersonalMeaning>
    </Panel>
    <VimshottariTimeline chart={vedic} />
  </div>;
}

function Timing({ chart, reports, busy, forecastCost, onRequestForecast, onEvidence }: {
  chart: NatalChartPayload;
  reports: Report[];
  busy: string | null;
  forecastCost: number;
  onRequestForecast: (horizon: TimingHorizon) => void;
  onEvidence: (target: string) => void;
}) {
  const [horizon, setHorizon] = useState<TimingHorizon>(30);
  const [timing, setTiming] = useState<PersonalTimingResult | null>(null);
  const [categories, setCategories] = useState<Set<TimingCategory>>(
    new Set(Object.keys(TIMING_CATEGORY_LABELS) as TimingCategory[])
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(0);
  const [aiDataConsent, setAiDataConsent] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/natal-chart/timing?horizon=${horizon}`, {
      credentials: "include", signal: controller.signal,
    }).then(async (response) => {
      const data = await responseJson<{ timing?: PersonalTimingResult; error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить периоды");
      setTiming(data.timing ?? null);
    }).catch((reason) => {
      if ((reason as Error).name !== "AbortError") {
        setError(reason instanceof Error ? reason.message : "Ошибка сети");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [horizon, requestId]);

  const visibleEvents = timing?.events.filter((event) => categories.has(event.category)) ?? [];
  const startMs = timing ? new Date(`${timing.windowStart}T00:00:00Z`).getTime() : Date.now();
  const grouped = visibleEvents.reduce<Record<"now" | "next" | "later", TimingEvent[]>>(
    (groups, event) => {
      const day = Math.floor((new Date(`${event.date}T00:00:00Z`).getTime() - startMs) / 86_400_000);
      groups[day <= 2 ? "now" : day <= 14 ? "next" : "later"].push(event);
      return groups;
    },
    { now: [], next: [], later: [] }
  );
  const categoryLabels = TIMING_CATEGORY_LABELS;
  const aspectLabels: Record<string, string> = {
    conjunction: "соединение", sextile: "секстиль", square: "квадрат",
    trine: "трин", opposition: "оппозиция",
  };
  const currentForecast = reports.find((report) =>
    report.reportType.startsWith(`forecast:${horizon}:`) && isCurrentReport(report, chart)
  );

  return <div className="space-y-6" aria-busy={loading}>
    <AstrologyGuide guide={NATAL_GUIDES.timing} />
    {!chart.timeKnown ? <UnknownTimeWarning context="Периоды, солнечное возвращение и прогрессии" /> : null}
    <Panel title="Персональный прогноз" eyebrow="FORECAST_REPORT · отдельная покупка">
      <SectionIntroduction title={`Текстовый прогноз на ${horizon === 365 ? "1 год" : `${horizon} дней`}`}>
        Расчёт событий ниже остаётся бесплатным. Платный отчёт превращает выбранный горизонт в связный текст с датами, возможностями, рисками и практическими рекомендациями, привязанными к проверяемым расчётам.
      </SectionIntroduction>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Горизонт прогноза">
        {([7, 30, 90, 365] as TimingHorizon[]).map((days) => <button key={days} type="button"
          onClick={() => setHorizon(days)} aria-pressed={horizon === days}
          className={`min-h-11 rounded-xl px-4 text-sm ${horizon === days ? "bg-cyan-300/15 text-cyan-100 ring-1 ring-cyan-300/25" : "bg-white/[0.04] text-white/55"}`}>
          {days === 365 ? "1 год" : `${days} дней`}
        </button>)}
      </div>
      {currentForecast ? <PanelBlock>
        <p className="text-xs text-emerald-100/60">
          Готов · {new Date(currentForecast.createdAt).toLocaleString("ru-RU")} · сохранён в архиве
        </p>
        {isNatalReport(currentForecast.structuredData)
          ? <StructuredReport report={currentForecast.structuredData} evidence={currentForecast.evidenceRefs ?? []} onEvidence={onEvidence} />
          : <Interpretation text={currentForecast.content} />}
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/cabinet/astrology/reports/${currentForecast.id}/print`} className="text-xs text-amber-200">Печать / PDF</Link>
        </div>
        <ReportShareControls reportKind="natal" reportId={currentForecast.id} />
      </PanelBlock> : <PanelBlock>
        <p className="text-xs leading-5 text-amber-100/60">После подтверждения будет списано {forecastCost} ᚢ.</p>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-white/55">
          <input type="checkbox" className="mt-0.5 accent-amber-300" checked={aiDataConsent} onChange={(event) => setAiDataConsent(event.target.checked)} />
          Подтверждаю передачу только рассчитанных астрологических данных внешней языковой модели для создания отчёта. Дата, время, город и координаты рождения не передаются.
        </label>
        <button type="button" disabled={!timing || busy !== null || !aiDataConsent} onClick={() => onRequestForecast(horizon)}
          className="btn-neon flex min-h-11 items-center justify-center gap-2 self-start px-5 text-sm disabled:opacity-50">
          {busy === "forecast" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Подтвердить и получить прогноз · {forecastCost} ᚢ
        </button>
      </PanelBlock>}
    </Panel>
    <Panel title="Персональная шкала" eyebrow={timing ? `${timing.windowStart} — ${timing.windowEnd}` : "Транзиты"}>
      <SectionIntroduction title="Шкала и фильтры">
        <p>Категории помогают сузить список тем, но не меняют расчёт.</p>
        <p className="text-xs leading-6 text-white/55">
          <ExplainTerm term="Ингресс">переход объекта в новый знак.</ExplainTerm>
          {" · "}
          <ExplainTerm term="Пик">момент наибольшей точности события.</ExplainTerm>
          {" · "}
          <ExplainTerm term="Орб">отклонение от точного угла.</ExplainTerm>
        </p>
      </SectionIntroduction>
      <PanelBlock>
      <div className="flex flex-wrap items-center gap-2">
        {loading ? <button type="button" onClick={() => setRequestId((value) => value + 1)}
          className="min-h-11 rounded-xl border border-white/10 px-4 text-sm text-white/55">
          Отменить и перезапустить
        </button> : <button type="button" onClick={() => setRequestId((value) => value + 1)}
          className="min-h-11 rounded-xl border border-white/10 px-4 text-sm text-white/55">Обновить</button>}
      </div>
      <fieldset>
        <legend className="mb-2 text-xs text-white/45">Фильтры категорий</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(categoryLabels) as TimingCategory[]).map((category) => <label key={category}
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-white/[0.035] px-3 text-xs text-white/60">
            <input type="checkbox" checked={categories.has(category)} onChange={() => {
              setCategories((previous) => {
                const next = new Set(previous);
                if (next.has(category)) next.delete(category); else next.add(category);
                return next;
              });
            }} className="accent-cyan-300" /> {categoryLabels[category]}
          </label>)}
        </div>
      </fieldset>
      {error ? <p className="rounded-xl bg-rose-400/[0.08] p-3 text-sm text-rose-200" role="alert">{error}</p> : null}
      {loading ? <p className="flex items-center gap-2 text-sm text-white/50" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Рассчитываем и проверяем кэш…</p> : null}
      {!loading && !error && !timing ? <Empty text="Для выбранного горизонта периоды пока не рассчитаны. Попробуйте обновить данные." /> : null}
      {!loading && timing ? <div className="space-y-5">
        {(["now", "next", "later"] as const).map((group) => <section key={group} aria-labelledby={`timing-${group}`}>
          <h3 id={`timing-${group}`} className="mb-3 text-sm font-medium text-cyan-100/80">
            {group === "now" ? "Сейчас" : group === "next" ? "Следом" : "Позже"}
          </h3>
          {grouped[group].length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {grouped[group].map((event) => <article id={evidenceAnchorId("timing", event.id)} tabIndex={-1} key={event.id} className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-3 focus:ring-2 focus:ring-cyan-300/50">
              <p className="text-sm text-white/75">{event.kind === "ingress"
                ? `${russianPlanetLabel(event.planetKey)}: ${event.previousSign ?? "знак не указан"} → ${event.sign ?? "знак не указан"}`
                : `${russianPlanetLabel(event.planetKey)} · ${aspectLabels[event.aspect ?? ""] ?? "аспект не указан"} · ${russianPlanetLabel(event.targetKey ?? "")}`}</p>
              <p className="mt-1 text-xs leading-5 text-white/40">Пик: {event.peakAtLocal.replace("T", " ")} · орб {event.orb.toFixed(3)}° / {event.maxOrb}°</p>
              <p className="text-[11px] text-white/40">{categoryLabels[event.category]} · {TIMING_SOURCE_LABELS[event.source]}</p>
            </article>)}
          </div> : <p className="text-xs text-white/30">Нет событий по выбранным фильтрам.</p>}
        </section>)}
      </div> : null}
      </PanelBlock>
    </Panel>

    <div className="space-y-6">
      <div id="solar-return" tabIndex={-1}><Panel title="Солнечное возвращение" eyebrow="Точный корень Солнца">
        <SectionIntroduction title="Солнечное возвращение">Это персональная карта на момент, когда Солнце возвращается точно в положение вашего рождения. Она описывает главные темы года от одного дня рождения до следующего. Планеты показывают действующие темы, а дома — области жизни, где они могут проявляться заметнее.</SectionIntroduction>
        {timing?.solarReturn ? <PanelBlock>
          <div className="grid gap-4 sm:grid-cols-2">
            <Metric label="Момент по UTC" value={new Date(timing.solarReturn.exactAtUtc).toLocaleString("ru-RU", { timeZone: "UTC" })} />
            <Metric label={`Местное время · ${timing.solarReturn.timezone}`} value={timing.solarReturn.exactAtLocal.replace("T", " ")} />
          </div>
          <section className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.025] p-4">
            <h3 className="text-sm font-medium text-cyan-100/85">Планеты года</h3>
            <p className="mt-1 text-xs leading-5 text-white/45">Знак описывает стиль проявления темы, дом — жизненную область. Это символическая интерпретация, а не обещание события.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {timing.solarReturn.positions.map((position) => <article key={position.key} className="rounded-lg border border-white/8 bg-black/20 p-3">
                <p className="text-sm font-medium text-white/75">{russianPlanetLabel(position.key)}</p>
                <p className="mt-1 text-xs leading-5 text-white/50">
                  {russianSignLabel(position.sign)} · {position.degree.toFixed(2)}°{position.house ? ` · ${position.house} дом` : ""}
                  {position.retrograde ? " · ретроградная" : ""}
                </p>
              </article>)}
            </div>
          </section>
          <section className="rounded-xl border border-amber-300/10 bg-amber-300/[0.025] p-4">
            <h3 className="text-sm font-medium text-amber-100/85">Дома солнечного возвращения</h3>
            <p className="mt-1 text-xs leading-5 text-white/45">
              Система: {timing.solarReturn.houses.system}. ASC — {russianSignLabel(timing.solarReturn.houses.ascendant.sign)} {timing.solarReturn.houses.ascendant.degree.toFixed(2)}°; MC — {russianSignLabel(timing.solarReturn.houses.midheaven.sign)} {timing.solarReturn.houses.midheaven.degree.toFixed(2)}°.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {timing.solarReturn.houses.cusps.map((cusp) => <article key={cusp.house} className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
                <p className="text-xs text-white/65">{cusp.house} дом</p>
                <p className="mt-1 text-xs text-white/40">{russianSignLabel(cusp.sign)} · {cusp.degree.toFixed(2)}°</p>
              </article>)}
            </div>
          </section>
          <details className="rounded-xl border border-white/8 bg-black/15 p-3">
            <summary className="cursor-pointer text-xs font-medium text-white/55">Как выполнен расчёт</summary>
            <p className="mt-2 text-xs leading-5 text-white/40">{timing.solarReturn.method}</p>
          </details>
          <p className="text-xs leading-5 text-amber-100/55">Место расчёта домов: {timing.solarReturn.location.label}. Сейчас используется сохранённое место рождения; поэтому дома описывают год относительно этой точки.</p>
          {timing.solarReturn.houses.warnings.length ? <ul className="space-y-1 text-xs leading-5 text-amber-100/55">{timing.solarReturn.houses.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul> : null}
        </PanelBlock> : <Empty text="Сначала загрузите расчёт периода." />}
      </Panel></div>
      <div className="grid gap-6 lg:grid-cols-2">
      <div id="secondary-progressions" tabIndex={-1}><Panel title="Вторичные прогрессии" eyebrow="День за год">
        <SectionIntroduction title="Вторичные прогрессии">Символический метод сопоставляет один день после рождения с одним годом жизни. Углы и дома намеренно не показываются.</SectionIntroduction>
        {timing?.progressions ? <PanelBlock>
          <Metric label="Символическая дата" value={timing.progressions.progressedAtUtc.slice(0, 10)} />
          <p className="text-xs text-white/45">Возраст: {timing.progressions.exactAgeYears.toFixed(6)} года · аспектов к наталу: {timing.progressions.aspectsToNatal.length}</p>
          <div className="max-h-48 space-y-1 overflow-auto">
            {timing.progressions.aspectsToNatal.slice(0, 12).map((aspect) => <p key={`${aspect.progressedKey}-${aspect.natalKey}-${aspect.aspect}`} className="text-xs text-white/55">
              {russianPlanetLabel(aspect.progressedKey)} {aspectLabels[aspect.aspect ?? ""] ?? "аспект"} {russianPlanetLabel(aspect.natalKey)} · {aspect.orb.toFixed(3)}°
            </p>)}
          </div>
          <p className="text-xs leading-5 text-amber-100/50">Прогрессивные углы и дома скрыты. Использован средний тропический год 365.2425 суток.</p>
        </PanelBlock> : <Empty text="Сначала загрузите расчёт периода." />}
      </Panel></div>
      <div id="current-dasha" tabIndex={-1}><Panel title="Текущий контекст" eyebrow="Вимшоттари махадаша">
        <SectionIntroduction title="Текущая даша">Даша — традиционная шкала периодов в джйотиш. Она показана как справочный контекст, а не как обещание событий.</SectionIntroduction>
        {chart.vedic?.dasha.current ? <PanelBlock>
          <Metric label="Управитель периода" value={russianGrahaLabel(chart.vedic.dasha.current.lord)} />
          <p className="text-xs text-white/45">{chart.vedic.dasha.current.startDate.slice(0, 10)} — {chart.vedic.dasha.current.endDate.slice(0, 10)}</p>
          <p className="text-xs leading-5 text-white/40">Ведический период показан как отдельный контекст и не смешивается математически с тропическими транзитами.</p>
        </PanelBlock> : <Empty text="Текущий период даши не рассчитан." />}
      </Panel></div>
      </div>
    </div>

  </div>;
}

function Reports({ chart, reports, loading, error, deletingReportId, onDelete, onReload, onEvidence, selectedReportId, onSelectReport }: {
  chart: NatalChartPayload; reports: Report[];
  loading: boolean; error: string;
  deletingReportId: string | null;
  onReload: () => void;
  onDelete: (report: Report) => void;
  onEvidence: (target: string) => void; selectedReportId: string | null;
  onSelectReport: (reportId: string | null) => void;
}) {
  const [filter, setFilter] = useState<"all" | "natal" | "forecast">("all");
  const currentIds = new Set<string>();
  const currentKeys = new Set<string>();
  for (const report of reports) {
    if (!isCurrentReport(report, chart)) continue;
    const key = `${report.tradition}:${report.reportType}`;
    if (!currentKeys.has(key)) {
      currentKeys.add(key);
      currentIds.add(report.id);
    }
  }
  const matchesFilter = (report: Report) => filter === "all"
    || (filter === "forecast" ? report.reportType.startsWith("forecast:") : report.reportType === "interpretation");
  const currentReports = reports.filter((report) => currentIds.has(report.id) && matchesFilter(report));
  const archivedReports = reports.filter((report) => !currentIds.has(report.id) && matchesFilter(report));
  const selected = reports.find((report) => report.id === selectedReportId && matchesFilter(report))
    ?? currentReports[0]
    ?? null;
  const selectReport = (reportId: string) => {
    onSelectReport(reportId);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "reports");
    url.searchParams.set("report", reportId);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  return <div className="space-y-6">
    <AstrologyGuide guide={NATAL_GUIDES.reports} />
    <Panel title="Архив отчётов и прогнозов" eyebrow="Сохранённые версии">
      <SectionIntroduction title="Здесь хранятся готовые материалы">
        Новые отчёты создаются в разделах «Западная», «Джйотиш» и «Периоды». Архив нужен для просмотра прошлых версий, печати, отправки ссылки и удаления.
      </SectionIntroduction>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтр отчётов">
        {([["all", "Все"], ["natal", "Натальные"], ["forecast", "Прогнозы"]] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
            className={`min-h-10 rounded-xl px-4 text-sm ${filter === value ? "bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/25" : "bg-white/[0.04] text-white/50"}`}>{label}</button>)}
      </div>
      {loading ? <p className="flex items-center gap-2 text-sm text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем отчёты…</p>
        : error ? <div><p className="text-sm text-rose-300">{error}</p><button type="button" onClick={onReload} className="mt-2 text-xs text-amber-200">Повторить</button></div>
        : currentReports.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{currentReports.map((report) =>
          <button key={report.id} type="button" onClick={() => selectReport(report.id)}
            className={`rounded-xl border p-4 text-left transition ${selected?.id === report.id ? "border-amber-300/30 bg-amber-300/[0.08]" : "border-white/10 bg-black/20 hover:border-amber-300/20"}`}>
            <span className="block text-sm font-medium text-white/80">{reportLabel(report)}</span>
            <span className="mt-2 block text-xs text-white/40">{new Date(report.createdAt).toLocaleString("ru-RU")} · {report.runeCost ?? "—"} ᚢ</span>
            <span className="mt-3 inline-block rounded-full bg-emerald-300/10 px-2 py-1 text-[10px] text-emerald-200">текущий</span>
          </button>)}</div>
        : <Empty text="Текущих отчётов в этом фильтре пока нет." />}
    </Panel>
    {selected ? <Panel title={reportLabel(selected)} eyebrow="Полный отчёт">
      <p className="text-xs text-white/35">{new Date(selected.createdAt).toLocaleString("ru-RU")} · сохранённая версия расчёта</p>
      {isNatalReport(selected.structuredData) ? <StructuredReport report={selected.structuredData} evidence={selected.evidenceRefs ?? []} onEvidence={onEvidence} /> : <Interpretation text={selected.content} />}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/cabinet/astrology/reports/${selected.id}/print`} className="text-xs text-amber-200">Печать / PDF</Link>
        <button type="button" disabled={deletingReportId !== null} onClick={() => onDelete(selected)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-300/15 px-3 text-xs text-rose-200/70 disabled:opacity-50">
          {deletingReportId === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Удалить
        </button>
      </div>
      <ReportShareControls reportKind="natal" reportId={selected.id} />
    </Panel> : null}
    {archivedReports.length ? <Panel title="Архив заменённых версий" eyebrow="Удаление без возврата">
      <div className="flex flex-col gap-3">{archivedReports.map((report) =>
        <button key={report.id} type="button" onClick={() => selectReport(report.id)} className="rounded-xl border border-white/10 bg-black/20 p-4 text-left">
          <span className="text-sm font-medium">{reportLabel(report)}</span><span className="ml-2 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/35">заменён</span>
          <span className="ml-3 text-xs text-white/40">{new Date(report.createdAt).toLocaleString("ru-RU")} · {report.runeCost ?? "—"} ᚢ</span>
        </button>)}</div>
    </Panel> : null}
  </div>;
}

function isCurrentReport(report: Report, chart: NatalChartPayload): boolean {
  if (!matchesCurrentChart(report, chart)) return false;
  if (!report.reportType.startsWith("forecast:")) return true;
  const [, rawHorizon, windowStart] = report.reportType.split(":");
  const horizon = Number(rawHorizon);
  if (!windowStart || !Number.isFinite(horizon)) return false;
  const start = new Date(`${windowStart}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return false;
  const end = new Date(start.getTime() + horizon * 86_400_000);
  const now = Date.now();
  return now >= start.getTime() && now < end.getTime();
}

function reportLabel(report: Report): string {
  if (report.reportType.startsWith("forecast:")) {
    const horizon = report.reportType.split(":")[1];
    return `Прогноз · ${horizon === "365" ? "1 год" : `${horizon} дней`}`;
  }
  return report.tradition === "western" ? "Западная трактовка" : "Трактовка джйотиш";
}

function ReportCard({ tradition, title, text, report, evidence, savedReport, busy, cost, onRequest, onEvidence, onOpenArchive }: {
  tradition: NatalTradition;
  title: string;
  text?: string;
  report?: NatalReport | null;
  evidence?: NatalEvidence[] | null;
  savedReport?: Report;
  busy: string | null;
  cost: number;
  onRequest: (tradition: NatalTradition) => void;
  onEvidence: (target: string) => void;
  onOpenArchive: () => void;
}) {
  const [aiDataConsent, setAiDataConsent] = useState(false);
  return <Panel title={title} eyebrow={text ? "Готов · сохранён в архиве" : "Отдельная покупка"}>
    {savedReport ? <p className="text-xs text-emerald-100/60">Создан {new Date(savedReport.createdAt).toLocaleString("ru-RU")} · {savedReport.runeCost ?? "—"} ᚢ</p> : null}
    {isNatalReport(report) ? <StructuredReport report={report} evidence={evidence ?? []} onEvidence={onEvidence} /> : text ? <Interpretation text={text} /> : <><p className="text-sm leading-6 text-white/50">Персональный отчёт создаётся здесь для выбранной традиции и после завершения остаётся в этой вкладке. Копия автоматически сохраняется в архиве.</p><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-white/55"><input type="checkbox" className="mt-0.5 accent-amber-300" checked={aiDataConsent} onChange={(event) => setAiDataConsent(event.target.checked)} />Подтверждаю передачу только рассчитанных астрологических данных внешней языковой модели для создания отчёта. Данные рождения и координаты не передаются.</label><button type="button" disabled={busy !== null || !aiDataConsent} onClick={() => onRequest(tradition)} className="btn-neon mt-4 flex min-h-11 w-full items-center justify-center gap-2 text-sm disabled:opacity-50">{busy === tradition ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Подтвердить и получить отчёт · {cost} ᚢ</button></>}
    {text ? <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-4">
      {savedReport ? <Link href={`/cabinet/astrology/reports/${savedReport.id}/print`} className="text-xs text-amber-200">Печать / PDF</Link> : null}
      <button type="button" onClick={onOpenArchive} className="text-xs text-white/50 transition hover:text-white/75">Открыть архив версий →</button>
    </div> : null}
    {savedReport ? <ReportShareControls reportKind="natal" reportId={savedReport.id} /> : null}
  </Panel>;
}

function StructuredReport({ report, evidence, onEvidence }: { report: NatalReport; evidence: NatalEvidence[]; onEvidence: (target: string) => void }) {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  return <article className="min-w-0">
    <div className="divide-y divide-white/[0.07]">
    {report.sections.map((section) => <section key={section.key} className="min-w-0 py-6 first:pt-0">
      <h3 className="font-display text-xl leading-snug text-amber-50">{section.title}</h3>
      <div className="mt-3 space-y-5">{section.claims.map((claim, index) => <div key={`${section.key}-${index}`}>
        <p className="text-[15px] leading-8 text-white/75">{claim.text}</p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="text-[10px] uppercase tracking-wide text-white/30">Основано на</span>
          {claim.evidenceIds.map((id) => {
            const item = byId.get(id);
            if (!item) return null;
            return <button type="button" key={id} title={`${item.value}${item.uncertainty ? ` · ${item.uncertainty}` : ""}`}
              onClick={() => onEvidence(item.deepLink)}
              className="rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-1 text-[11px] text-amber-100/75 transition hover:bg-amber-300/[0.13]">
              Показать расчёт: {item.label} · {item.confidence === "high" ? "полнота высокая" : item.confidence === "medium" ? "полнота средняя" : "полнота ограничена"}
            </button>;
          })}
        </div>
      </div>)}</div>
    </section>)}
    </div>
    <aside className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-4 text-xs leading-5 text-white/45">
      <p><span className="text-cyan-100/65">Методология:</span> {report.methodology}</p>
      <p className="mt-2">Метка полноты показывает, насколько полны исходные данные и расчёт; она не подтверждает истинность интерпретации.</p>
      <p className="mt-2"><span className="text-amber-100/65">Ограничения:</span> {report.disclaimer}</p>
      {evidence.some((item) => item.uncertainty) ? <details className="mt-2"><summary className="cursor-pointer text-white/55">Ограничения расчёта</summary><ul className="mt-2 space-y-1">{evidence.filter((item) => item.uncertainty).slice(0, 12).map((item) => <li key={item.id}>• {item.label}: {item.uncertainty}</li>)}</ul></details> : null}
    </aside>
  </article>;
}

function Interpretation({ text }: { text: string }) { return <div className="space-y-3">{toParagraphs(text).map((paragraph, index) => <p key={index} className="text-sm leading-7 text-white/70">{paragraph}</p>)}</div>; }
function UnknownTimeWarning({ context }: { context?: string }) { return <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-4 text-sm text-amber-50"><p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Ограниченная точность без времени рождения</p><p className="mt-1 text-xs leading-5 text-amber-100/60">{context ? `${context}: ` : ""}ASC, MC, дома и лагна скрыты; асцендент D9 также исключён. Положения быстрых объектов и привязка периодов могут иметь дополнительную неопределённость.</p></div>; }
function Panel({ title, eyebrow, className = "", children }: { title: string; eyebrow: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`isolate overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] shadow-[0_12px_36px_rgba(0,0,0,.12)] ${className}`}>
      <header className="border-b border-white/[0.06] px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[10px] font-medium uppercase leading-relaxed tracking-[.14em] text-amber-200/45">{eyebrow}</p>
        <h2 className="mt-2 font-display text-xl font-semibold leading-snug text-white">{title}</h2>
      </header>
      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5 sm:py-6">{children}</div>
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-[10px] font-medium uppercase leading-relaxed tracking-wide text-white/35">{label}</p><p className="mt-2 break-words text-sm leading-6 text-white/70">{value}</p></div>; }
function StatusLine({ label, ready, detail }: { label: string; ready: boolean; detail?: string }) { return <p className="mb-2 flex items-center justify-between text-sm text-white/55"><span className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${ready ? "text-emerald-300" : "text-white/20"}`} />{label}</span>{detail ? <span>{detail}</span> : null}</p>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm leading-6 text-white/40">{text}</p>; }
function Unavailable({ title }: { title: string }) { return <StateCard icon={Archive} title={title} text="Текущий сохранённый расчёт не содержит данных для этого раздела. Пересчитайте карту или проверьте профиль." />; }
function StateCard({ icon: Icon, title, text, spin, action }: { icon: typeof Star; title: string; text: string; spin?: boolean; action?: React.ReactNode }) { return <main className="flex min-h-[70vh] items-center justify-center bg-[#09070d] px-4 text-white"><section className="max-w-lg rounded-3xl border border-amber-300/15 bg-white/[0.03] p-8 text-center"><Icon className={`mx-auto h-8 w-8 text-amber-200 ${spin ? "animate-spin" : ""}`} /><h1 className="mt-4 font-display text-2xl font-semibold">{title}</h1><p className="mt-3 text-sm leading-6 text-white/50">{text}</p>{action ? <div className="mt-5">{action}</div> : null}</section></main>; }
