"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Archive, ArrowLeft, CalendarClock, CheckCircle2, Compass,
  HeartHandshake, Loader2, Orbit, RefreshCw, ScrollText, Sparkles, Star,
} from "lucide-react";
import NatalChartWheel from "./NatalChartWheel";
import NatalSynastryWheel from "./NatalSynastryWheel";
import CompositeWheel from "./CompositeWheel";
import ReportShareControls from "./ReportShareControls";
import { VedicChartPair, VimshottariTimeline } from "./VedicCharts";
import { AstrologyGuide, ExplainTerm, PanelBlock, PersonalMeaning, SectionIntroduction } from "./AstrologyGuide";
import { usePaywall } from "@/contexts/PaywallContext";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { toParagraphs } from "@/lib/format-paragraphs";
import {
  aspectRows, bigThree, methodology, midpointRows, patternRows,
  positionRows, matchesCurrentChart, type NatalChartPayload,
} from "@/lib/natal/presentation";
import { evidenceAnchorId } from "@/lib/natal/evidence-anchor";
import {
  IMPORTANCE_PLANET_KEYS, russianGrahaLabel, russianPlanetLabel,
  russianSignLabel, TIMING_CATEGORY_LABELS, TIMING_SOURCE_LABELS,
} from "@/lib/natal/labels";
import type { NatalTradition } from "@/lib/natal/types";
import type { NatalEvidence } from "@/lib/natal/evidence";
import { isNatalReport, type NatalReport } from "@/lib/natal/report";
import type { VedicChart } from "@/lib/natal/vedic";
import type {
  PersonalTimingResult, TimingCategory, TimingEvent, TimingHorizon,
} from "@/lib/natal/timing";
import type { ClientSynastryPayload } from "@/lib/natal/synastry";
import {
  explainAspect, explainDasha, explainGraha, explainMidpoint, explainPattern, explainVedicHouse,
  explainPosition, NATAL_GUIDES,
} from "@/lib/natal/explainers";

type TimingPreferences = {
  enabled: boolean;
  horizons: TimingHorizon[];
  categories: TimingCategory[];
  planetImportance: string[];
  frequency: "daily" | "weekly";
  inApp: boolean;
  push: boolean;
  timezone: string;
};

type Tab = "overview" | "western" | "jyotish" | "timing" | "relationships" | "reports";
type Report = {
  id: string; tradition: NatalTradition; reportType: string; content: string;
  runeCost: number | null; createdAt: string; engineVersion: string; ephemeris: string;
  structuredData: NatalReport | null;
  evidenceRefs: NatalEvidence[] | null;
  birthFingerprint: string;
};

const TABS: Array<{ id: Tab; label: string; icon: typeof Star }> = [
  { id: "overview", label: "Обзор", icon: Star },
  { id: "western", label: "Западная", icon: Orbit },
  { id: "jyotish", label: "Джйотиш", icon: Compass },
  { id: "timing", label: "Периоды", icon: CalendarClock },
  { id: "relationships", label: "Отношения", icon: HeartHandshake },
  { id: "reports", label: "Отчёты", icon: ScrollText },
];

async function responseJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new Error(`Сервер вернул некорректный ответ (${response.status})`); }
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
  const [busy, setBusy] = useState<"recompute" | NatalTradition | null>(null);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [notice, setNotice] = useState("");
  const [aiContextEnabled, setAiContextEnabled] = useState(false);
  const [tarotContextEnabled, setTarotContextEnabled] = useState(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const [freshReports, setFreshReports] = useState<Partial<Record<NatalTradition, {
    text: string; report: NatalReport | null; evidence: NatalEvidence[];
  }>>>({});

  const selectTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetchRobust("/api/natal-chart/history?limit=100", { credentials: "include" });
      const data = await responseJson<{ reports?: Report[]; error?: string }>(response);
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить историю");
      setReports(data.reports ?? []);
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : "Не удалось загрузить историю");
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
    setPreferenceError("");
    void fetch("/api/natal-chart/ai-preferences", { credentials: "include" })
      .then(async (response) => {
        const data = await responseJson<{
        preferences?: { aiContextEnabled: boolean; tarotContextEnabled: boolean };
        error?: string;
        }>(response);
        if (!response.ok || !data.preferences) throw new Error(data.error || "Не удалось загрузить настройки ИИ");
        return data;
      })
      .then((data) => {
        setAiContextEnabled(data.preferences?.aiContextEnabled === true);
        setTarotContextEnabled(data.preferences?.tarotContextEnabled === true);
      })
      .catch((reason) => setPreferenceError(reason instanceof Error ? reason.message : "Не удалось загрузить настройки ИИ"))
      .finally(() => setPreferencesLoaded(true));
    const requested = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (requested && TABS.some((item) => item.id === requested)) setTab(requested);
  }, [loadChart, loadHistory]);

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

  const saveAiPreferences = async (
    patch: { aiContextEnabled: boolean } | { tarotContextEnabled: boolean }
  ) => {
    setPreferenceSaving(true);
    setPreferenceError("");
    try {
      const response = await fetch("/api/natal-chart/ai-preferences", {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await responseJson<{
        preferences?: { aiContextEnabled: boolean; tarotContextEnabled: boolean };
        error?: string;
      }>(response);
      if (!response.ok || !data.preferences) throw new Error(data.error || "Не удалось сохранить настройку");
      setAiContextEnabled(data.preferences.aiContextEnabled);
      setTarotContextEnabled(data.preferences.tarotContextEnabled);
    } catch (reason) {
      setPreferenceError(reason instanceof Error ? reason.message : "Ошибка сети");
    } finally {
      setPreferenceSaving(false);
    }
  };

  const requestInterpretation = async (tradition: NatalTradition) => {
    setBusy(tradition);
    setError("");
    try {
      const response = await fetch("/api/natal-chart/interpretation", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradition, aiDataUseAcknowledged: true }),
      });
      const data = await responseJson<{
        interpretation?: string; report?: NatalReport | null; evidence?: NatalEvidence[];
        error?: string; balance?: number; cost?: number; requiredRunes?: number;
        action?: string; retryAfter?: number; retryAfterSec?: number;
      }>(response);
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
        } else {
          setNotice(data.error || "Отчёт уже создаётся. Повторите попытку немного позже.");
        }
        return;
      }
      if (!response.ok) throw new Error(data.error || "Не удалось получить трактовку");
      if (data.interpretation) {
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
        void loadHistory();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка сети");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <StateCard icon={Loader2} spin title="Строим астрологическое пространство" text="Загружаем карту, методологию и сохранённые отчёты…" />;
  if (enabled === false) return <StateCard icon={Star} title="Астрология временно недоступна" text="Раздел выключен в настройках платформы. Ваши профильные данные не изменены." />;
  if (!chart) return <StateCard icon={Compass} title="Данных для расчёта пока нет" text="Добавьте дату, город и, по возможности, точное время рождения в профиле." action={<Link href="/cabinet" className="btn-neon inline-flex px-4 py-2 text-sm">Перейти в профиль</Link>} />;

  const western = chart.western;
  const westernReport = chart.interpretations?.western ?? chart.interpretation;
  const vedicReport = chart.interpretations?.vedic;

  return (
    <main className="min-h-screen bg-[#09070d] pb-16 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(245,158,11,.12),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(124,58,237,.11),transparent_30%)]" />
      <div className="relative mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-8">
        <header className="rounded-3xl border border-amber-300/15 bg-black/35 p-5 backdrop-blur-xl sm:p-7">
          <Link href="/cabinet" className="inline-flex items-center gap-2 text-xs text-white/50 transition hover:text-amber-100">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Кабинет
          </Link>
          <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-[11px] uppercase tracking-[.25em] text-amber-300/55">Aura · натальная карта</p>
              <h1 className="mt-2 font-display text-3xl font-semibold sm:text-5xl">Астрологическое пространство</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
                Западная карта, джйотиш, периоды и ваши платные отчёты — с прозрачной методологией и ограничениями расчёта.
              </p>
            </div>
            <button type="button" onClick={() => void loadChart(true)} disabled={busy !== null}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-4 text-sm text-amber-100 transition hover:bg-amber-300/[0.13] disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${busy === "recompute" ? "animate-spin" : ""}`} aria-hidden /> Пересчитать карту
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
          {tab === "western" && (western ? <Western chart={chart} western={western} /> : <Unavailable title="Западный расчёт отсутствует" />)}
          {tab === "jyotish" && (chart.vedic ? <Jyotish chart={chart} vedic={chart.vedic} /> : <Unavailable title="Расчёт джйотиш отсутствует" />)}
          {tab === "timing" && <Timing chart={chart} />}
          {tab === "relationships" && <Relationships jointCost={cost("JOINT_READING")} />}
          {tab === "reports" && <Reports chart={chart} reports={reports} freshReports={freshReports} loading={historyLoading} error={historyError} western={westernReport} vedic={vedicReport} busy={busy} cost={cost("NATAL_READING")} forecastCost={cost("FORECAST_REPORT")} onRequest={requestInterpretation} onReload={loadHistory} onEvidence={focusEvidence} aiContextEnabled={aiContextEnabled} tarotContextEnabled={tarotContextEnabled} preferenceSaving={preferenceSaving} preferencesLoaded={preferencesLoaded} preferenceError={preferenceError} onAiContext={(value) => saveAiPreferences({ aiContextEnabled: value })} onTarotContext={(value) => saveAiPreferences({ tarotContextEnabled: value })} />}
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
      <button type="button" onClick={() => onTab("reports")} className="mt-4 text-xs text-amber-200/70 hover:text-amber-100">Открыть отчёты →</button>
    </Panel>
    {chart.transits?.length ? <Panel className="lg:col-span-3" title="Актуальные транзиты" eyebrow="Периоды">
      <SectionIntroduction title="Текущие транзиты">Это рассчитанные положения небесных объектов сейчас относительно карты рождения. Они служат темами для наблюдения, а не утверждениями о будущих событиях.</SectionIntroduction>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{chart.transits.slice(0, 9).map((transit, index) => <article key={`${transit.kind}-${index}`} className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.04] p-3 text-xs leading-5 text-white/55">{transit.note}</article>)}</div>
    </Panel> : null}
  </div>;
}

function Western({ chart, western }: { chart: NatalChartPayload; western: Record<string, unknown> }) {
  const positions = positionRows(western, chart.timeKnown);
  const aspects = aspectRows(western);
  const patterns = patternRows(western);
  const midpoints = midpointRows(western);
  const method = methodology(western, chart.engineVersion);
  return <div className="space-y-6">
    <AstrologyGuide guide={NATAL_GUIDES.western} />
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

function Jyotish({ chart, vedic }: { chart: NatalChartPayload; vedic: VedicChart }) {
  const moon = vedic.moonSign;
  return <div className="space-y-6">
    <AstrologyGuide guide={NATAL_GUIDES.jyotish} />
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

function Timing({ chart }: { chart: NatalChartPayload }) {
  const [horizon, setHorizon] = useState<TimingHorizon>(30);
  const [timing, setTiming] = useState<PersonalTimingResult | null>(null);
  const [preferences, setPreferences] = useState<TimingPreferences | null>(null);
  const [categories, setCategories] = useState<Set<TimingCategory>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    // #region agent log
    fetch("http://127.0.0.1:7394/ingest/19b6b482-2a3a-42dc-852e-bc41c46f6a24", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "82087b" },
      body: JSON.stringify({
        sessionId: "82087b",
        runId: "timing-pre-fix",
        hypothesisId: "H1,H2,H3,H4,H5",
        location: "AstrologyWorkspace.tsx:Timing.useEffect",
        message: "Timing request started",
        data: { horizon, requestId, preferencesCached: Boolean(preferences) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    Promise.all([
      fetch(`/api/natal-chart/timing?horizon=${horizon}`, {
        credentials: "include", signal: controller.signal,
      }).then(async (response) => {
        const data = await responseJson<{ timing?: PersonalTimingResult; error?: string }>(response);
        // #region agent log
        fetch("http://127.0.0.1:7394/ingest/19b6b482-2a3a-42dc-852e-bc41c46f6a24", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "82087b" },
          body: JSON.stringify({
            sessionId: "82087b",
            runId: "timing-pre-fix",
            hypothesisId: "H1,H2,H3,H4,H5",
            location: "AstrologyWorkspace.tsx:Timing.timingResponse",
            message: "Timing response received",
            data: {
              horizon,
              status: response.status,
              retryAfter: response.headers.get("retry-after"),
              error: data.error ?? null,
              hasTiming: Boolean(data.timing),
              eventCount: Array.isArray(data.timing?.events) ? data.timing.events.length : null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить периоды");
        return data.timing ?? null;
      }),
      preferences ? Promise.resolve(preferences) : fetch("/api/natal-chart/event-preferences", {
        credentials: "include", signal: controller.signal,
      }).then(async (response) => {
        const data = await responseJson<{ preferences?: TimingPreferences; error?: string }>(response);
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить настройки");
        return data.preferences ?? null;
      }),
    ]).then(([nextTiming, nextPreferences]) => {
      setTiming(nextTiming);
      if (nextPreferences) {
        setPreferences(nextPreferences);
        if (!categories.size) setCategories(new Set(nextPreferences.categories));
      }
    }).catch((reason) => {
      if ((reason as Error).name !== "AbortError") {
        // #region agent log
        fetch("http://127.0.0.1:7394/ingest/19b6b482-2a3a-42dc-852e-bc41c46f6a24", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "82087b" },
          body: JSON.stringify({
            sessionId: "82087b",
            runId: "timing-pre-fix",
            hypothesisId: "H1,H2,H3,H4,H5",
            location: "AstrologyWorkspace.tsx:Timing.catch",
            message: "Timing request failed",
            data: {
              horizon,
              name: reason instanceof Error ? reason.name : "non-error",
              message: reason instanceof Error ? reason.message : String(reason),
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setError(reason instanceof Error ? reason.message : "Ошибка сети");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
    // Categories are deliberately initialized once from preferences.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon, requestId]);

  const savePreferences = async (patch: Partial<TimingPreferences>) => {
    if (!preferences) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/natal-chart/event-preferences", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await responseJson<{ preferences?: TimingPreferences; error?: string }>(response);
      if (!response.ok || !data.preferences) throw new Error(data.error || "Не удалось сохранить настройки");
      setPreferences(data.preferences);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

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

  return <div className="space-y-6" aria-busy={loading}>
    <AstrologyGuide guide={NATAL_GUIDES.timing} />
    {!chart.timeKnown ? <UnknownTimeWarning context="Периоды, солнечное возвращение и прогрессии" /> : null}
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
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Горизонт расчёта">
        {([7, 30, 90, 365] as TimingHorizon[]).map((days) => <button key={days} type="button"
          onClick={() => setHorizon(days)} aria-pressed={horizon === days}
          className={`min-h-11 rounded-xl px-4 text-sm ${horizon === days ? "bg-cyan-300/15 text-cyan-100 ring-1 ring-cyan-300/25" : "bg-white/[0.04] text-white/55"}`}>
          {days === 365 ? "1 год" : `${days} дней`}
        </button>)}
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

    <Panel title="Уведомления о событиях" eyebrow="Персональные настройки">
      <SectionIntroduction title="Что меняют настройки">Включение разрешает выбранные уведомления в приложении с указанной частотой и часовым поясом. Фильтры определяют, какие расчётные события могут попасть в список; они не создают прогнозов.</SectionIntroduction>
      {preferences ? <PanelBlock className="gap-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex min-h-11 items-center gap-2 text-sm text-white/60"><input type="checkbox"
            checked={preferences.enabled} disabled={saving}
            onChange={(event) => void savePreferences({ enabled: event.target.checked })} /> События включены</label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-white/60"><input type="checkbox"
            checked={preferences.inApp} disabled={saving}
            onChange={(event) => void savePreferences({ inApp: event.target.checked })} /> В приложении</label>
          <label className="text-xs text-white/45">Частота
            <select value={preferences.frequency} disabled={saving}
              onChange={(event) => void savePreferences({ frequency: event.target.value as "daily" | "weekly" })}
              className="mt-1 block min-h-11 w-full rounded-lg border border-white/10 bg-[#15121b] px-3 text-sm text-white">
              <option value="daily">Ежедневно</option><option value="weekly">Еженедельно</option>
            </select>
          </label>
          <div><p className="text-xs text-white/45">Push</p><p className="mt-2 text-xs leading-5 text-white/35">Нативный push-канал пока не подключён; персональные тексты и память в уведомления не передаются.</p></div>
        </div>
        <details className="rounded-xl border border-white/10 bg-black/15 p-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-white/70">Расширенные фильтры уведомлений</summary>
          <p className="mt-1 text-xs leading-5 text-white/45">Меняйте их, только если хотите сузить список. Основные включение и частота находятся выше.</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-3">
          <fieldset>
            <legend className="text-xs text-white/45">Горизонты уведомлений</legend>
            <div className="mt-2 flex flex-wrap gap-2">{([7, 30, 90, 365] as TimingHorizon[]).map((days) => <label key={days} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-white/55">
              <input type="checkbox" checked={preferences.horizons.includes(days)} disabled={saving}
                onChange={() => void savePreferences({ horizons: preferences.horizons.includes(days)
                  ? preferences.horizons.filter((item) => item !== days)
                  : [...preferences.horizons, days] })} /> {days}
            </label>)}</div>
          </fieldset>
          <fieldset>
            <legend className="text-xs text-white/45">Категории уведомлений</legend>
            <div className="mt-2 flex flex-wrap gap-2">{(Object.keys(categoryLabels) as TimingCategory[]).map((category) => <label key={category} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-white/55">
              <input type="checkbox" checked={preferences.categories.includes(category)} disabled={saving}
                onChange={() => void savePreferences({ categories: preferences.categories.includes(category)
                  ? preferences.categories.filter((item) => item !== category)
                  : [...preferences.categories, category] })} /> {categoryLabels[category]}
            </label>)}</div>
          </fieldset>
          <fieldset>
            <legend className="text-xs text-white/45">Важные планеты</legend>
            <div className="mt-2 flex flex-wrap gap-2">{IMPORTANCE_PLANET_KEYS.map((planet) => <label key={planet} className="flex min-h-10 items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-white/55">
              <input type="checkbox" checked={preferences.planetImportance.includes(planet)} disabled={saving}
                onChange={() => void savePreferences({ planetImportance: preferences.planetImportance.includes(planet)
                  ? preferences.planetImportance.filter((item) => item !== planet)
                  : [...preferences.planetImportance, planet] })} /> {russianPlanetLabel(planet)}
            </label>)}</div>
          </fieldset>
        </div>
        </details>
        <p className="text-[11px] text-white/30">Часовой пояс доставки: {preferences.timezone}. Сохранение: {saving ? "выполняется…" : "готово"}.</p>
      </PanelBlock> : <p className="text-sm text-white/40">Настройки загружаются…</p>}
    </Panel>
  </div>;
}

type RelationshipItem = {
  id: string; token: string; status: string; intentTitle: string;
  initiatorName: string | null; partnerName: string | null; preview: string | null;
  createdAt: string; completedAt: string | null; synastry: ClientSynastryPayload | null;
};

function Relationships({ jointCost }: { jointCost: number }) {
  const [items, setItems] = useState<RelationshipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadRelationships = useCallback(async () => {
    setLoading(true);
    setError("");
    await fetch("/api/joint-reading/mine", { credentials: "include" })
      .then(async (response) => {
        const data = await responseJson<{ items?: RelationshipItem[]; error?: string }>(response);
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить отношения");
        setItems(data.items ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Ошибка сети"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { void loadRelationships(); }, [loadRelationships]);
  if (loading) return <StateCard icon={Loader2} spin title="Загружаем отношения" text="Читаем ваши завершённые совместные отчёты…" />;
  return <div className="space-y-6">
    <AstrologyGuide guide={NATAL_GUIDES.relationships} />
    <Panel title="Стоимость и область покупки" eyebrow="JOINT_READING · администратор может изменить цену">
      <p className="text-sm leading-6 text-white/55">Создание совместного расклада стоит {jointCost} ᚢ; каждый участник отдельно оплачивает свой выбранный расклад. Отчёт отношений, синастрия и композит входят в завершённый совместный поток — повторного списания здесь нет.</p>
      <Link href="/joint-reading" className="mt-3 inline-flex min-h-10 items-center text-sm text-amber-200">Создать совместный расклад →</Link>
    </Panel>
    {error ? <div className="rounded-xl bg-rose-400/[0.08] p-3 text-rose-200" role="alert"><p>{error}</p><button type="button" onClick={() => void loadRelationships()} className="mt-2 min-h-10 text-xs text-amber-200">Повторить</button></div> : null}
    {items.length ? items.map((item) => {
      const labelA = item.initiatorName?.trim() || "Участник A";
      const labelB = item.partnerName?.trim() || "Участник B";
      return <Panel key={item.id} title={`${labelA} и ${labelB}`} eyebrow={`${item.intentTitle} · ${item.status === "completed" ? "готов" : "в процессе"}`}>
        <p className="text-xs text-white/35">{new Date(item.completedAt ?? item.createdAt).toLocaleString("ru-RU")}</p>
        {item.synastry ? <>
          <SectionIntroduction title="Индексы и аспекты">Каждый индекс 0–100 — округлённый ориентир по ограниченному набору кросс-аспектов, не оценка шансов или будущего пары. Ниже указаны аспекты, которые поддержали конкретную шкалу.</SectionIntroduction>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{item.synastry.dimensions.map((dimension) =>
            <article key={dimension.key} className="rounded-lg border border-white/8 bg-white/[0.025] p-3">
              <p className="text-xs text-white/65">{dimension.label}</p>
              <p className="mt-1 text-sm text-amber-100">{dimension.band} · {dimension.index}/100</p>
              <ul className="mt-2 space-y-1 text-[10px] text-white/35">{dimension.supportingAspectIds.map((id) => {
                const aspect = item.synastry?.crossAspects.find((candidate) => candidate.id === id);
                return aspect ? <li key={id}>{aspect.label}</li> : null;
              })}</ul>
            </article>)}</div>
          {item.synastry.chartA?.western && item.synastry.chartB?.western ? <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <NatalSynastryWheel chartA={item.synastry.chartA.western} chartB={item.synastry.chartB.western}
              crossAspects={item.synastry.crossAspects} labelA={labelA} labelB={labelB} />
            <CompositeWheel composite={item.synastry.composite} />
          </div> : null}
          <p className="mt-3 text-xs leading-5 text-white/45">Композит — математическая средняя карта связи; он не содержит домов и углов. Публикуйте или печатайте отчёт только с согласием участников.</p>
          <ReportShareControls reportKind="relationship" reportId={item.id} />
        </> : <p className="mt-3 text-sm text-white/45">Сохранённый расчёт синастрии отсутствует; polling не пересчитывает завершённые legacy-отчёты.</p>}
        <div className="mt-4 flex flex-wrap gap-4"><Link href={`/joint-reading/${encodeURIComponent(item.token)}`} className="text-sm text-amber-200">Открыть полный отчёт →</Link>
          {item.status === "completed" ? <Link href={`/joint-reading/${encodeURIComponent(item.token)}/print`} className="text-sm text-amber-200">Печать / PDF</Link> : null}</div>
      </Panel>;
    }) : <Empty text="Совместных отчётов пока нет." />}
  </div>;
}

function Reports({ chart, reports, freshReports, loading, error, western, vedic, busy, cost, forecastCost, onRequest, onReload, onEvidence, aiContextEnabled, tarotContextEnabled, preferenceSaving, preferencesLoaded, preferenceError, onAiContext, onTarotContext }: {
  chart: NatalChartPayload; reports: Report[];
  freshReports: Partial<Record<NatalTradition, { text: string; report: NatalReport | null; evidence: NatalEvidence[] }>>;
  loading: boolean; error: string; western?: string; vedic?: string; busy: string | null;
  cost: number; forecastCost: number; onRequest: (tradition: NatalTradition) => void; onReload: () => void;
  onEvidence: (target: string) => void; aiContextEnabled: boolean; tarotContextEnabled: boolean;
  preferenceSaving: boolean; preferencesLoaded: boolean; preferenceError: string;
  onAiContext: (enabled: boolean) => void; onTarotContext: (enabled: boolean) => void;
}) {
  const currentWestern = reports.find((report) =>
    report.tradition === "western" && report.reportType !== "forecast" && matchesCurrentChart(report, chart));
  const currentVedic = reports.find((report) =>
    report.tradition === "vedic" && report.reportType !== "forecast" && matchesCurrentChart(report, chart));
  const currentIds = new Set<string>();
  for (const report of reports) {
    if (!matchesCurrentChart(report, chart)) continue;
    const key = `${report.tradition}:${report.reportType}`;
    if (![...currentIds].some((id) => {
      const current = reports.find((item) => item.id === id);
      return current && `${current.tradition}:${current.reportType}` === key;
    })) currentIds.add(report.id);
  }
  return <div className="space-y-6">
    <AstrologyGuide guide={NATAL_GUIDES.reports} />
    <div className="grid gap-6 lg:grid-cols-2">
      <ReportCard tradition="western" title="Западная трактовка" text={freshReports.western?.text ?? currentWestern?.content ?? western} report={freshReports.western ? freshReports.western.report : currentWestern?.structuredData} evidence={freshReports.western ? freshReports.western.evidence : currentWestern?.evidenceRefs} busy={busy} cost={cost} onRequest={onRequest} onEvidence={onEvidence} />
      <ReportCard tradition="vedic" title="Трактовка джйотиш" text={freshReports.vedic?.text ?? currentVedic?.content ?? vedic} report={freshReports.vedic ? freshReports.vedic.report : currentVedic?.structuredData} evidence={freshReports.vedic ? freshReports.vedic.evidence : currentVedic?.evidenceRefs} busy={busy} cost={cost} onRequest={onRequest} onEvidence={onEvidence} />
    </div>
    <Panel title="Прозрачные цены" eyebrow="Действие и область одной покупки">
      <SectionIntroduction title="Цена и область">Сумма относится к указанному виду отчёта и текущей версии карты. Покупка одного отчёта не включает другой формат или будущий прогноз.</SectionIntroduction>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Западный отчёт" value={`${cost} ᚢ · одна интерпретация текущей версии карты`} />
        <Metric label="Отчёт джйотиш" value={`${cost} ᚢ · одна интерпретация текущей версии карты`} />
        <Metric label="Отчёт о периодах" value={`${forecastCost} ᚢ · цена устанавливается администратором; покупка не включена, списания нет`} />
      </div>
    </Panel>
    <Panel title="Натальная карта в Shri Raj" eyebrow="Приватность · два независимых согласия">
      <SectionIntroduction title="Три независимых решения">Платный отчёт требует отдельного разового подтверждения при заказе. Ниже — два добровольных и выключенных по умолчанию согласия: одно для обычного чата, другое для Таро.</SectionIntroduction>
      {preferenceError ? <p className="rounded-xl border border-rose-400/25 bg-rose-400/[0.07] p-3 text-sm text-rose-200" role="alert">{preferenceError}</p> : null}
      <div className="space-y-4">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <input type="checkbox" className="mt-1 accent-amber-300" checked={aiContextEnabled} disabled={preferenceSaving || !preferencesLoaded}
          onChange={(event) => onAiContext(event.target.checked)} />
        <span><span className="block text-sm text-white/75">Разрешить натальный контекст в обычном чате с Shri Raj</span>
          <span className="mt-1 block text-xs leading-5 text-white/40">По умолчанию выключено. При включении внешней языковой модели передаются только рассчитанные положения и периоды с идентификаторами расчёта; дата, время, город и координаты рождения не передаются.</span></span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <input type="checkbox" className="mt-1 accent-amber-300" checked={tarotContextEnabled} disabled={preferenceSaving || !preferencesLoaded}
          onChange={(event) => onTarotContext(event.target.checked)} />
        <span><span className="block text-sm text-white/75">Отдельно разрешить натальный контекст в раскладах Таро Shri Raj</span>
          <span className="mt-1 block text-xs leading-5 text-white/40">По умолчанию выключено и не зависит от настройки чата. Передаются только рассчитанные данные, без даты, времени, города и координат рождения; карты Таро остаются главным источником расклада.</span></span>
      </label>
      </div>
    </Panel>
    <Panel title="История версий" eyebrow="Неизменяемые платные отчёты">
      <SectionIntroduction title="Расчёт, версии и публикация">Кнопки «Показать расчёт» в отчёте открывают конкретные рассчитанные данные. История сохраняет прежние версии; печать и ссылка на публикацию относятся только к выбранному отчёту.</SectionIntroduction>
      {loading ? <p className="flex items-center gap-2 text-sm text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем историю…</p> : error ? <div><p className="text-sm text-rose-300">{error}</p><button type="button" onClick={onReload} className="mt-2 text-xs text-amber-200">Повторить</button></div> : reports.length ? <div className="flex flex-col gap-3">{reports.map((report) => <details key={report.id} className="rounded-xl border border-white/10 bg-black/20">
        <summary className="cursor-pointer px-4 py-3 text-sm"><span className="font-medium">{report.reportType === "forecast" ? "Прогноз" : report.tradition === "western" ? "Западная" : "Джйотиш"}</span><span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${currentIds.has(report.id) ? "bg-emerald-300/10 text-emerald-200" : "bg-white/[0.05] text-white/35"}`}>{currentIds.has(report.id) ? "текущий" : "заменён"}</span><span className="ml-3 text-xs text-white/40">{new Date(report.createdAt).toLocaleString("ru-RU")} · {report.runeCost ?? "—"} ᚢ</span></summary>
        <div className="border-t border-white/8 p-4"><p className="mb-3 text-[11px] text-white/35">Версия расчёта и метод сохранены вместе с отчётом.</p>{isNatalReport(report.structuredData) ? <StructuredReport report={report.structuredData} evidence={report.evidenceRefs ?? []} onEvidence={onEvidence} /> : <Interpretation text={report.content} />}
          <div className="mt-4 flex flex-wrap gap-3"><Link href={`/cabinet/astrology/reports/${report.id}/print`} className="text-xs text-amber-200">Печать / PDF</Link></div>
          <ReportShareControls reportKind="natal" reportId={report.id} />
        </div>
      </details>)}</div> : <Empty text="Сохранённых платных отчётов пока нет." />}
    </Panel>
  </div>;
}

function ReportCard({ tradition, title, text, report, evidence, busy, cost, onRequest, onEvidence }: { tradition: NatalTradition; title: string; text?: string; report?: NatalReport | null; evidence?: NatalEvidence[] | null; busy: string | null; cost: number; onRequest: (tradition: NatalTradition) => void; onEvidence: (target: string) => void }) {
  return <Panel title={title} eyebrow={text ? "Готов" : "Отдельная покупка"}>
    {isNatalReport(report) ? <StructuredReport report={report} evidence={evidence ?? []} onEvidence={onEvidence} /> : text ? <Interpretation text={text} /> : <><p className="text-sm leading-6 text-white/50">Персональный отчёт создаётся отдельно для этой традиции и сохраняется в истории.</p><p className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.05] p-3 text-xs leading-5 text-amber-100/65">Это разовое явное подтверждение для платного отчёта. Внешней языковой модели передаются только рассчитанные положения и периоды с идентификаторами расчёта; дата, время, город и координаты рождения исключены. Настройки чата и Таро не используются и не меняются. После подтверждения будет списано {cost} ᚢ.</p><button type="button" disabled={busy !== null} onClick={() => onRequest(tradition)} className="btn-neon mt-4 flex min-h-11 w-full items-center justify-center gap-2 text-sm disabled:opacity-50">{busy === tradition ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Подтвердить и получить отчёт · {cost} ᚢ</button></>}
  </Panel>;
}

function StructuredReport({ report, evidence, onEvidence }: { report: NatalReport; evidence: NatalEvidence[]; onEvidence: (target: string) => void }) {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  return <div className="min-w-0 space-y-5">
    {report.sections.map((section) => <section key={section.key} className="min-w-0 rounded-xl border border-white/8 bg-black/15 p-4">
      <h3 className="font-display text-lg text-amber-50">{section.title}</h3>
      <div className="mt-3 space-y-4">{section.claims.map((claim, index) => <article key={`${section.key}-${index}`}>
        <p className="text-sm leading-7 text-white/70">{claim.text}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5"><span className="text-[10px] uppercase tracking-wide text-white/30">Основано на</span>
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
      </article>)}</div>
    </section>)}
    <aside className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-4 text-xs leading-5 text-white/45">
      <p><span className="text-cyan-100/65">Методология:</span> {report.methodology}</p>
      <p className="mt-2">Метка полноты показывает, насколько полны исходные данные и расчёт; она не подтверждает истинность интерпретации.</p>
      <p className="mt-2"><span className="text-amber-100/65">Ограничения:</span> {report.disclaimer}</p>
      {evidence.some((item) => item.uncertainty) ? <details className="mt-2"><summary className="cursor-pointer text-white/55">Ограничения расчёта</summary><ul className="mt-2 space-y-1">{evidence.filter((item) => item.uncertainty).slice(0, 12).map((item) => <li key={item.id}>• {item.label}: {item.uncertainty}</li>)}</ul></details> : null}
    </aside>
  </div>;
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
