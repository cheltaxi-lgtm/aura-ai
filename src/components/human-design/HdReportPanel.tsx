"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PaywallModal from "@/components/PaywallModal";
import {
  HD_FULL_REPORT_MODULES,
  sanitizeHdReportText,
  type HdChart,
  type HdReportTone,
} from "@/lib/human-design";
import { useRuneConfig } from "@/lib/useRuneConfig";
import HdFoundationBrief from "./HdFoundationBrief";
import HdReportSections from "./HdReportSections";
import { hdApiErrorMessage } from "./hd-errors";

interface HdReport {
  id: string;
  status: "pending" | "done" | "error";
  reportText: string | null;
  packageId?: "depth" | "max";
  includedAsksRemaining?: number;
  reportTone?: HdReportTone;
}

const TONE_OPTIONS: Array<{ id: HdReportTone; label: string; hint: string }> = [
  { id: "personal", label: "Личный", hint: "Для себя" },
  { id: "child", label: "Ребёнок", hint: "Для родителя" },
  { id: "work", label: "Работа", hint: "Карьера и роль" },
];

interface HdReportPanelProps {
  chartId: string;
  chart?: HdChart | null;
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
  const [paywall, setPaywall] = useState<{ balance: number; required: number } | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [dialog, setDialog] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const [includedAsks, setIncludedAsks] = useState(0);
  const [tone, setTone] = useState<HdReportTone>("personal");
  const dialogEndRef = useRef<HTMLDivElement>(null);

  const reportCost = cost("HD_REPORT");
  const askCost = cost("HD_ASK");

  useEffect(() => {
    setReport(null);
    setDialog([]);
    setError(null);
    setQuestion("");
    setPaywall(null);
    setAcknowledged(false);
    setLoadError(null);
    setIncludedAsks(0);
    setTone("personal");
  }, [chartId]);

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
          const text =
            typeof d.report.reportText === "string"
              ? sanitizeHdReportText(d.report.reportText)
              : d.report.reportText;
          setReport({ ...d.report, reportText: text });
          setIncludedAsks(Number(d.report.includedAsksRemaining) || 0);
          if (d.report.reportTone === "child" || d.report.reportTone === "work") {
            setTone(d.report.reportTone);
          }
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
  }, [authenticated, chartId, loadNonce]);

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

  const buyReport = useCallback(
    async (opts?: { regenerate?: boolean }) => {
      if (loading) return;
      if (!opts?.regenerate && !acknowledged) {
        setError("Подтвердите передачу данных карты языковой модели.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/human-design/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chartId,
            aiDataUseAcknowledged: true,
            regenerate: opts?.regenerate === true,
            tone,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 402) {
          setPaywall({
            balance: Number(data.balance) || 0,
            required: Number(data.required) || reportCost,
          });
          return;
        }
        if (!res.ok) {
          setError(hdApiErrorMessage(data, "Не удалось создать разбор."));
          return;
        }
        if (data.report?.status === "done") {
          const text =
            typeof data.report.reportText === "string"
              ? sanitizeHdReportText(data.report.reportText)
              : data.report.reportText;
          setReport({ ...data.report, reportText: text });
          setIncludedAsks(Number(data.report.includedAsksRemaining) || 0);
        }
      } catch {
        setError("Сеть недоступна. Попробуйте ещё раз.");
      } finally {
        setLoading(false);
      }
    },
    [acknowledged, chartId, loading, reportCost, tone]
  );

  const tonePicker = (
    <div className="hd-tone-picker mt-4" role="radiogroup" aria-label="Тон разбора">
      {TONE_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={tone === opt.id}
          className={tone === opt.id ? "is-active" : undefined}
          onClick={() => setTone(opt.id)}
        >
          <strong>{opt.label}</strong>
          <span>{opt.hint}</span>
        </button>
      ))}
    </div>
  );

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
    if (!q || !report) return;
    setAsking(true);
    setError(null);
    setDialog((prev) => [...prev, { role: "user", content: q }]);
    setQuestion("");
    try {
      const res = await fetch("/api/human-design/report/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          question: q,
          aiDataUseAcknowledged: true,
        }),
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
        setError(hdApiErrorMessage(data, "Не удалось получить ответ."));
        return;
      }
      setDialog((prev) => [...prev, { role: "assistant", content: data.answer }]);
      if (typeof data.includedAsksRemaining === "number") {
        setIncludedAsks(data.includedAsksRemaining);
      } else if (data.usedIncludedAsk) {
        setIncludedAsks((n) => Math.max(0, n - 1));
      }
    } catch {
      if (await recoverAskFromHistory(report.id, q)) return;
      setDialog((prev) => prev.slice(0, -1));
      setQuestion(q);
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setAsking(false);
    }
  }, [askCost, question, recoverAskFromHistory, report]);

  const modulesCard = (
    <div className="hd-packages hd-packages--single mt-4">
      <div className="hd-package is-active is-featured">
        <span className="hd-package__badge">Всё включено</span>
        <strong className="hd-package__label">Полный разбор</strong>
        <span className="hd-package__tagline">
          Одна оплата — максимальная глубина, примеры, PDF и вопросы Эвелине
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

  if (!authenticated) {
    return (
      <div className="space-y-5">
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

  if (!report) {
    return (
      <div className="space-y-5">
        {chart && (
          <div className="hd-panel">
            <HdFoundationBrief chart={chart} />
          </div>
        )}
        <div className="hd-panel">
          <p className="hd-panel__title">Полный разбор от Эвелины</p>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            «Опора» выше — бесплатно. Ниже один полный премиальный разбор: без доплат и апгрейдов.
          </p>
          {modulesCard}
          <p className="mt-3 text-xs text-white/50">
            Одна цена · выберите тон текста (не отдельный тариф):
          </p>
          {tonePicker}
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
          <button
            type="button"
            onClick={() => void buyReport()}
            disabled={!acknowledged || loading}
            className="btn-luxe btn-luxe--gold mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {loading
              ? "Эвелина пишет полный разбор…"
              : `Получить полный разбор · ${
                  ready ? formatRunesWithRub(reportCost) : `${reportCost} ᚢ`
                }`}
          </button>
          {loading && (
            <p className="mt-2 text-xs text-white/45">
              Полный текст обычно 1–2 минуты. Не закрывайте страницу.
            </p>
          )}
          <PaywallModal
            isOpen={paywall !== null}
            onClose={() => setPaywall(null)}
            options={{
              currentBalance: paywall?.balance ?? 0,
              requiredRunes: paywall?.required ?? reportCost,
              onUnlocked: () => setPaywall(null),
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="hd-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="hd-panel__title">Полный разбор от Эвелины</p>
            {includedAsks > 0 && (
              <p className="mt-1 text-xs text-amber-100/55">
                Включено вопросов без доплаты: {includedAsks}
              </p>
            )}
          </div>
          <div className="hd-print-hidden flex flex-wrap gap-2">
            <button
              type="button"
              className="hd-bodygraph__export"
              disabled={loading}
              onClick={() => void buyReport({ regenerate: true })}
              title="Бесплатно пересобрать в полном формате"
            >
              {loading ? "Пересобираю…" : "Пересобрать полностью"}
            </button>
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
        <p className="hd-print-hidden mt-3 text-xs text-white/50">
          Тон для пересборки (бесплатно, тот же полный разбор):
        </p>
        {tonePicker}
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
          onUnlocked: () => setPaywall(null),
        }}
      />
    </div>
  );
}
