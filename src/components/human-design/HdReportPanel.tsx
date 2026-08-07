"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PaywallModal from "@/components/PaywallModal";
import {
  HD_FULL_REPORT_MODULES,
  sanitizeHdReportText,
  type HdChart,
  type HdPublicChart,
} from "@/lib/human-design";
import { useRuneConfig } from "@/lib/useRuneConfig";
import HdFoundationBrief from "./HdFoundationBrief";
import HdGenerating from "./HdGenerating";
import HdJourney, { type HdJourneyStep } from "./HdJourney";
import HdReportSections from "./HdReportSections";
import { hdApiErrorMessage } from "./hd-errors";
import { useHdReportWait } from "./useHdReportWait";

interface HdReport {
  id: string;
  status: "pending" | "done" | "error" | "needs_regeneration";
  reportText: string | null;
  packageId?: "depth" | "max";
  includedAsksRemaining?: number;
  resumeFree?: boolean;
}

interface HdReportPanelProps {
  chartId: string;
  chart?: HdChart | HdPublicChart | null;
  authenticated: boolean;
  loginReturnTo: string;
}

export default function HdReportPanel({
  chartId,
  chart = null,
  authenticated,
  loginReturnTo,
}: HdReportPanelProps) {
  const { cost, formatRunesWithRub, ready } = useRuneConfig();
  const [report, setReport] = useState<HdReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [dedupeNotice, setDedupeNotice] = useState(false);
  const [paywall, setPaywall] = useState<{ balance: number; required: number } | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [dialog, setDialog] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const [includedAsks, setIncludedAsks] = useState(0);
  /** Immediate UI flag — not cleared by stale poll races. */
  const [uiGenerating, setUiGenerating] = useState(false);
  const dialogEndRef = useRef<HTMLDivElement>(null);
  const postInFlightRef = useRef(false);
  const askInFlightRef = useRef(false);

  const reportCost = cost("HD_REPORT");
  const askCost = cost("HD_ASK");

  const applyDoneReport = useCallback((r: HdReport) => {
    const text =
      typeof r.reportText === "string" ? sanitizeHdReportText(r.reportText) : r.reportText;
    setReport({ ...r, reportText: text, status: "done" });
    setIncludedAsks(Number(r.includedAsksRemaining) || 0);
    setLoading(false);
    setUiGenerating(false);
  }, []);

  const { waiting, startedAt, startWait, stopWait } = useHdReportWait({
    mode: "personal",
    enabled: authenticated,
    chartId,
    onDone: (r) => applyDoneReport(r as HdReport),
    onError: (msg) => {
      setError(msg);
      setLoading(false);
      setUiGenerating(false);
    },
  });

  useEffect(() => {
    setReport(null);
    setDialog([]);
    setError(null);
    setQuestion("");
    setDedupeNotice(false);
    setPaywall(null);
    setAcknowledged(false);
    setLoadError(null);
    setIncludedAsks(0);
    setUiGenerating(false);
    stopWait();
  }, [chartId, stopWait]);

  /** Silently resume a stale paid pending report on the server (no charge). */
  const resumePendingGeneration = useCallback(async () => {
    if (postInFlightRef.current) return;
    postInFlightRef.current = true;
    try {
      const res = await fetch("/api/human-design/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chartId,
          aiDataUseAcknowledged: true,
          regenerate: false,
          tone: "personal",
          async: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        // Never actually charged — fall back to the normal purchase CTA.
        stopWait();
        setLoading(false);
        setUiGenerating(false);
        setReport(null);
        return;
      }
      if (data.report?.status === "done") {
        applyDoneReport(data.report as HdReport);
        stopWait();
      }
    } catch {
      /* polling continues; errors surface on poll ticks */
    } finally {
      postInFlightRef.current = false;
    }
  }, [applyDoneReport, chartId, stopWait]);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    setLoadError(null);
    fetch(`/api/human-design/report?chartId=${encodeURIComponent(chartId)}`)
      .then((r) => {
        if (!r.ok) throw new Error("report_load_failed");
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        if (d?.report?.status === "done") {
          applyDoneReport(d.report as HdReport);
          return;
        }
        if (d?.report?.status === "pending") {
          setReport({ ...(d.report as HdReport), reportText: null });
          setUiGenerating(true);
          startWait({ baselineText: null });
          setLoading(true);
          // A paid pending row without an active worker (crash / repaired
          // report) would hang forever — kick a free resume on the server.
          void resumePendingGeneration();
          return;
        }
        if (d?.report?.status === "error") {
          const er = d.report as HdReport;
          setReport({ ...er, reportText: null });
          setError(
            er.resumeFree
              ? "Генерация не завершилась. Оплата сохранена — нажмите ещё раз, повторного списания не будет."
              : "Генерация не завершилась. Если руны списались — они уже возвращены; нажмите ещё раз для новой попытки."
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Не удалось загрузить разбор. Проверьте сеть.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, chartId, loadNonce, applyDoneReport, startWait, resumePendingGeneration]);

  const reportId = report?.id ?? null;
  useEffect(() => {
    if (!authenticated || !reportId) return;
    let cancelled = false;
    fetch(`/api/human-design/report/ask?reportId=${encodeURIComponent(reportId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !Array.isArray(d?.messages)) return;
        const restored = d.messages
          .filter((m: unknown): m is { role: "user" | "assistant"; content: string } =>
            Boolean(
              m &&
                typeof m === "object" &&
                ((m as { role?: unknown }).role === "user" ||
                  (m as { role?: unknown }).role === "assistant") &&
                typeof (m as { content?: unknown }).content === "string"
            )
          )
          .map((m: { role: "user" | "assistant"; content: string }) => ({
            role: m.role,
            content: m.content,
          }));
        if (restored.length) setDialog(restored);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authenticated, reportId]);

  useEffect(() => {
    dialogEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [dialog.length]);

  const buyReport = useCallback(async () => {
    if (loading || postInFlightRef.current || uiGenerating || waiting) return;
    // Already paid & done — no free rebuild from the UI.
    if (report?.status === "done" && report.reportText) return;
    if (!acknowledged && !waiting) {
      setError("Подтвердите передачу данных карты языковой модели.");
      return;
    }
    setLoading(true);
    setUiGenerating(true);
    setError(null);
    startWait({ baselineText: null });
    postInFlightRef.current = true;
    try {
      const res = await fetch("/api/human-design/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chartId,
          aiDataUseAcknowledged: true,
          regenerate: false,
          tone: "personal",
          async: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        stopWait();
        setLoading(false);
        setUiGenerating(false);
        setPaywall({
          balance: Number(data.balance) || 0,
          required: Number(data.required) || reportCost,
        });
        return;
      }
      // Durable worker accepted the job: poll /api/jobs/:id + entity GET fallback.
      if (res.status === 202) {
        setLoading(false);
        setUiGenerating(true);
        const jobId = typeof data.jobId === "string" ? data.jobId : null;
        if (jobId) {
          void (async () => {
            try {
              const { waitForAsyncJob } = await import("@/lib/client/wait-for-async-job");
              const result = await waitForAsyncJob({
                jobId,
                storageKey: `aura:hd-report-job:${chartId}`,
                maxAgeMs: 20 * 60_000,
                pollIntervalMs: 2500,
              });
              const r = result?.report as HdReport | undefined;
              if (r?.status === "done" && r.reportText) {
                applyDoneReport(r);
                setDedupeNotice(result.deduped === true);
                stopWait();
              }
            } catch {
              // Entity poll in useHdReportWait continues.
            }
          })();
        }
        return;
      }
      // Another tab / resume already generating — keep polling.
      if (res.status === 409 && data?.code === "CLAIM_BUSY") {
        setUiGenerating(true);
        startWait({ baselineText: null });
        return;
      }
      if (!res.ok) {
        stopWait();
        setLoading(false);
        setUiGenerating(false);
        setError(hdApiErrorMessage(data, "Не удалось создать разбор."));
        return;
      }
      if (data.report?.status === "done") {
        applyDoneReport(data.report as HdReport);
        setDedupeNotice(data.deduped === true);
        stopWait();
      } else if (data.report?.status === "pending") {
        setReport({ ...(data.report as HdReport), reportText: null });
        setUiGenerating(true);
        startWait({ baselineText: null });
      }
    } catch {
      setUiGenerating(true);
      startWait({ baselineText: null });
      setError(
        "Связь прервалась, но генерация могла продолжаться на сервере. Ждём результат…"
      );
    } finally {
      postInFlightRef.current = false;
    }
  }, [
    acknowledged,
    applyDoneReport,
    chartId,
    loading,
    report?.reportText,
    report?.status,
    reportCost,
    startWait,
    stopWait,
    uiGenerating,
    waiting,
  ]);

  const recoverAskFromHistory = useCallback(
    async (id: string, q: string): Promise<boolean> => {
      try {
        const res = await fetch(
          `/api/human-design/report/ask?reportId=${encodeURIComponent(id)}`
        );
        if (!res.ok) return false;
        const d = await res.json().catch(() => null);
        if (!Array.isArray(d?.messages)) return false;
        const msgs = d.messages as Array<{ role: string; content: string }>;
        for (let i = msgs.length - 2; i >= 0; i--) {
          if (msgs[i]?.role === "user" && msgs[i].content === q && msgs[i + 1]?.role === "assistant") {
            const restored = msgs
              .filter(
                (m): m is { role: "user" | "assistant"; content: string } =>
                  (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
              )
              .map((m) => ({ role: m.role, content: m.content }));
            setDialog(restored);
            setQuestion("");
            setError(null);
            return true;
          }
        }
      } catch {
        /* fall through */
      }
      return false;
    },
    []
  );

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q || !report || askInFlightRef.current) return;
    askInFlightRef.current = true;
    setAsking(true);
    setError(null);
    setDialog((prev) => [...prev, { role: "user", content: q }]);
    setQuestion("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const res = await fetch("/api/human-design/report/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          question: q,
          aiDataUseAcknowledged: true,
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setDialog((prev) => prev.slice(0, -1));
        setQuestion(q);
        setPaywall({
          balance: Number(data.balance) || 0,
          required: Number(data.required) || askCost,
        });
        return;
      }
      if (!res.ok || typeof data.answer !== "string") {
        if (await recoverAskFromHistory(report.id, q)) return;
        setDialog((prev) => prev.slice(0, -1));
        setQuestion(q);
        // Ask errors stay in component error state — never merge into reportText.
        setError(hdApiErrorMessage(data, "Не удалось получить ответ."));
        return;
      }
      setDialog((prev) => [...prev, { role: "assistant", content: data.answer }]);
      if (typeof data.includedAsksRemaining === "number") {
        setIncludedAsks(data.includedAsksRemaining);
      } else if (data.usedIncludedAsk) {
        setIncludedAsks((n) => Math.max(0, n - 1));
      }
    } catch (e) {
      if (await recoverAskFromHistory(report.id, q)) return;
      setDialog((prev) => prev.slice(0, -1));
      setQuestion(q);
      const timedOut = e instanceof DOMException && e.name === "AbortError";
      setError(
        timedOut
          ? "Ответ не пришёл за 45 секунд. Текст ошибки не добавлен в разбор — нажмите ещё раз."
          : "Сеть недоступна. Попробуйте ещё раз."
      );
    } finally {
      clearTimeout(timer);
      askInFlightRef.current = false;
      setAsking(false);
    }
  }, [askCost, question, recoverAskFromHistory, report]);

  const modulesCard = (
    <div className="hd-packages hd-packages--single mt-4">
      <div className="hd-package is-active is-featured">
        <span className="hd-package__badge">Всё включено</span>
        <strong className="hd-package__label">Полный разбор</strong>
        <span className="hd-package__tagline">
          Одна оплата — полная расшифровка: тип, 9 центров, каналы, крест, сон, бизнес,
          скрытые разделы, PDF и вопросы Эвелине
        </span>
        <span className="hd-package__price">
          {ready ? formatRunesWithRub(reportCost) : `${reportCost} ᚢ`}
        </span>
        <ul className="hd-package__modules">
          {HD_FULL_REPORT_MODULES.map((m) => (
            <li key={m.id}>
              <span aria-hidden="true">✓</span>
              <span>
                <em>{m.title}</em>
                {m.blurb}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const isGenerating = uiGenerating || waiting || loading;
  const reportDone = report?.status === "done" && Boolean(report.reportText);
  const journeySteps: HdJourneyStep[] = [
    { id: "chart", label: "Карта", hint: "бодиграф готов", state: "done" },
    { id: "foundation", label: "Опора", hint: "бесплатно", state: "done" },
    {
      id: "report",
      label: "Разбор",
      hint: reportDone ? "готов" : isGenerating ? "Эвелина пишет…" : "полный текст",
      state: reportDone ? "done" : "current",
    },
    {
      id: "dialog",
      label: "Диалог",
      hint: "вопросы Эвелине",
      state: reportDone ? "current" : "locked",
    },
  ];
  const journeyBlock = (
    <div className="hd-journey-wrap hd-print-hidden">
      <HdJourney steps={journeySteps} />
    </div>
  );
  const generatingBlock = isGenerating ? (
    <div className="hd-panel">
      <HdGenerating kind="personal" startedAt={startedAt ?? undefined} />
      {error && (
        <p className="mt-3 text-sm text-amber-100/70" role="status">
          {error}
        </p>
      )}
    </div>
  ) : null;

  if (!authenticated) {
    return (
      <div className="space-y-5">
        {journeyBlock}
        {chart && (
          <div className="hd-panel">
            <HdFoundationBrief chart={chart} />
          </div>
        )}
        <div className="hd-panel">
          <p className="hd-panel__title">Полный разбор от Эвелины</p>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            Премиальная интерпретация всей карты: с объяснениями, примерами из жизни и практиками.
            Войдите, чтобы сохранить карту и получить текст.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/40">
            Гостевая карта хранится 30 дней — после входа она навсегда останется в вашем архиве.
          </p>
          {modulesCard}
          <a
            href={`/auth/user/login?returnTo=${encodeURIComponent(loginReturnTo)}`}
            className="btn-luxe btn-luxe--gold mt-5 inline-flex"
          >
            Войти и получить полный разбор ·{" "}
            {ready ? formatRunesWithRub(reportCost) : `${reportCost} ᚢ`}
          </a>
        </div>
      </div>
    );
  }

  if (generatingBlock && (!report || report.status !== "done" || !report.reportText)) {
    return (
      <div className="space-y-5">
        {journeyBlock}
        {chart && (
          <div className="hd-panel">
            <HdFoundationBrief chart={chart} />
          </div>
        )}
        {generatingBlock}
        <PaywallModal
          isOpen={paywall !== null}
          onClose={() => setPaywall(null)}
          options={{
            currentBalance: paywall?.balance ?? 0,
            requiredRunes: paywall?.required ?? reportCost,
            onUnlocked: () => {
              setPaywall(null);
              void buyReport();
            },
          }}
        />
      </div>
    );
  }

  if (!report || report.status !== "done" || !report.reportText) {
    return (
      <div className="space-y-5">
        {journeyBlock}
        {chart && (
          <div className="hd-panel">
            <HdFoundationBrief chart={chart} />
          </div>
        )}
        <div className="hd-panel">
          <p className="hd-panel__title">Полный разбор от Эвелины</p>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            «Опора» выше — бесплатно. Ниже одна полная расшифровка: без доплат и апгрейдов.
          </p>
          {modulesCard}
          {loadError && (
            <div
              className="mt-3 rounded-2xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-200/90"
              role="alert"
            >
              <p>{loadError}</p>
              <button
                type="button"
                className="mt-2 underline underline-offset-2 hover:text-red-100"
                onClick={() => setLoadNonce((n) => n + 1)}
              >
                Повторить
              </button>
            </div>
          )}
          <label className="mt-4 flex items-start gap-2.5 text-xs leading-relaxed text-white/60">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 accent-amber-500"
            />
            <span>
              Подтверждаю передачу рассчитанных данных карты внешней языковой модели для генерации
              разбора.
            </span>
          </label>
          {error && (
            <p className="mt-3 text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
          <div className="hd-sticky-cta mt-4">
            <button
              type="button"
              onClick={() => void buyReport()}
              disabled={!acknowledged || loading || waiting}
              className="btn-luxe btn-luxe--gold w-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              {report?.resumeFree
                ? "Продолжить генерацию · без списания"
                : `Получить полную расшифровку · ${
                    ready ? formatRunesWithRub(reportCost) : `${reportCost} ᚢ`
                  }`}
            </button>
          </div>
          <PaywallModal
            isOpen={paywall !== null}
            onClose={() => setPaywall(null)}
            options={{
              currentBalance: paywall?.balance ?? 0,
              requiredRunes: paywall?.required ?? reportCost,
              onUnlocked: () => {
                setPaywall(null);
                void buyReport();
              },
            }}
          />
        </div>
      </div>
    );
  }

  if (generatingBlock) {
    return (
      <div className="space-y-5">
        {journeyBlock}
        {generatingBlock}
        <PaywallModal
          isOpen={paywall !== null}
          onClose={() => setPaywall(null)}
          options={{
            currentBalance: paywall?.balance ?? 0,
            requiredRunes: paywall?.required ?? reportCost,
            onUnlocked: () => {
              setPaywall(null);
              void buyReport();
            },
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {journeyBlock}
      <div className="hd-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="hd-panel__title">Полный разбор от Эвелины</p>
            {includedAsks > 0 && (
              <p className="mt-1 text-xs text-amber-100/55">
                Включено вопросов без доплаты: {includedAsks}
              </p>
            )}
            {dedupeNotice && (
              <p className="mt-1 text-xs text-emerald-100/60">
                Эта же карта уже была разобрана ранее — показан оплаченный
                текст, повторного списания не было.
              </p>
            )}
          </div>
          <div className="hd-print-hidden flex flex-wrap gap-2">
            <a
              href={`/cabinet/human-design/reports/${report.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="hd-bodygraph__export"
            >
              Печать / PDF
            </a>
          </div>
        </div>
        {error && (
          <p className="hd-print-hidden mt-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4">
          <HdReportSections text={report.reportText ?? ""} />
        </div>
      </div>

      <div className="hd-panel hd-print-hidden">
        <p className="hd-panel__title">Вопросы по разбору</p>
        <p className="mt-1.5 text-xs text-white/50">
          {includedAsks > 0
            ? `Сначала списываются включённые вопросы (${includedAsks}), затем ${
                ready ? formatRunesWithRub(askCost) : `${askCost} ᚢ`
              } за вопрос`
            : `Эвелина отвечает в контексте карты · ${
                ready ? formatRunesWithRub(askCost) : `${askCost} ᚢ`
              } за вопрос`}
        </p>

        {dialog.length > 0 && (
          <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
            {dialog.map((msg, i) => (
              <div
                key={i}
                className={
                  msg.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-50"
                    : "mr-auto max-w-[92%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm leading-relaxed text-white/85"
                }
              >
                {msg.content}
              </div>
            ))}
            <div ref={dialogEndRef} />
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
            maxLength={2000}
            placeholder="Например: как мне принимать решения по авторитету?"
            className="hd-field__input flex-1"
            disabled={asking}
          />
          <button
            type="button"
            onClick={() => void ask()}
            disabled={asking || !question.trim()}
            className="btn-luxe btn-luxe--gold btn-luxe--sm shrink-0 disabled:opacity-50"
          >
            {asking ? "…" : "Спросить"}
          </button>
        </div>
      </div>

      <PaywallModal
        isOpen={paywall !== null}
        onClose={() => setPaywall(null)}
        options={{
          currentBalance: paywall?.balance ?? 0,
          requiredRunes: paywall?.required ?? askCost,
          onUnlocked: () => {
            setPaywall(null);
            void ask();
          },
        }}
      />
    </div>
  );
}
