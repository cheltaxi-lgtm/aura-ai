"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import PaywallModal from "@/components/PaywallModal";
import { useRuneConfig } from "@/lib/useRuneConfig";

interface HdReport {
  id: string;
  status: "pending" | "done" | "error";
  reportText: string | null;
}

interface HdReportPanelProps {
  chartId: string;
  authenticated: boolean;
  loginReturnTo: string;
}

export default function HdReportPanel({
  chartId,
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
  const dialogEndRef = useRef<HTMLDivElement>(null);

  const reportCost = cost("HD_REPORT");
  const askCost = cost("HD_ASK");

  useEffect(() => {
    if (!authenticated) return;
    fetch(`/api/human-design/report?chartId=${encodeURIComponent(chartId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.report?.status === "done") setReport(d.report);
      })
      .catch(() => undefined);
  }, [authenticated, chartId]);

  useEffect(() => {
    dialogEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [dialog.length]);

  const buyReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/human-design/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartId, aiDataUseAcknowledged: acknowledged }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setPaywall({ balance: Number(data.balance) || 0, required: Number(data.required) || reportCost });
        return;
      }
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось создать разбор.");
        return;
      }
      if (data.report?.status === "done") {
        setReport(data.report);
      }
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, [acknowledged, chartId, reportCost]);

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
        body: JSON.stringify({ reportId: report.id, question: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setDialog((prev) => prev.slice(0, -1));
        setPaywall({ balance: Number(data.balance) || 0, required: Number(data.required) || askCost });
        return;
      }
      if (!res.ok || typeof data.answer !== "string") {
        setDialog((prev) => prev.slice(0, -1));
        setError(typeof data.error === "string" ? data.error : "Не удалось получить ответ.");
        return;
      }
      setDialog((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch {
      setDialog((prev) => prev.slice(0, -1));
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setAsking(false);
    }
  }, [askCost, question, report]);

  if (!authenticated) {
    return (
      <div className="hd-panel text-center">
        <p className="hd-panel__title">Полный разбор от Эвелины</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/65">
          Глубокий персональный разбор вашей карты: тип и стратегия в жизни, авторитет
          принятия решений, профиль, каналы и инкарнационный крест — тёплым языком,
          с практическими рекомендациями.
        </p>
        <a
          href={`/auth/user/login?returnTo=${encodeURIComponent(loginReturnTo)}`}
          className="btn-luxe btn-luxe--gold mt-5 inline-flex"
        >
          Войти и получить разбор · {ready ? formatRunesWithRub(reportCost) : `${reportCost} ᚢ`}
        </a>
        <p className="mt-3 text-[0.6875rem] text-white/40">
          Ваша карта сохранится автоматически после входа.
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="hd-panel">
        <p className="hd-panel__title">Полный разбор от Эвелины</p>
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          Эвелина разберёт вашу карту по разделам: тип и стратегия, авторитет, профиль,
          определённые и открытые центры, каналы, инкарнационный крест и практические
          рекомендации. После разбора можно задавать уточняющие вопросы.
        </p>
        <label className="mt-4 flex items-start gap-2.5 text-xs leading-relaxed text-white/60">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 accent-amber-500"
          />
          <span>
            Подтверждаю передачу рассчитанных данных карты внешней языковой модели
            для генерации разбора.
          </span>
        </label>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <button
          type="button"
          onClick={buyReport}
          disabled={!acknowledged || loading}
          className="btn-luxe btn-luxe--gold mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {loading
            ? "Эвелина пишет разбор…"
            : `Получить полный разбор · ${ready ? formatRunesWithRub(reportCost) : `${reportCost} ᚢ`}`}
        </button>
        {loading && (
          <p className="mt-2 text-xs text-white/45">
            Обычно занимает 30–60 секунд. Не закрывайте страницу.
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
    );
  }

  return (
    <div className="space-y-5">
      <div className="hd-panel">
        <div className="flex items-center justify-between gap-3">
          <p className="hd-panel__title">Разбор от Эвелины</p>
          <a
            href={`/cabinet/human-design/reports/${report.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="hd-bodygraph__export hd-print-hidden"
          >
            Печать / PDF
          </a>
        </div>
        <div className="hd-report mt-4">
          <ReactMarkdown>{report.reportText ?? ""}</ReactMarkdown>
        </div>
      </div>

      <div className="hd-panel hd-print-hidden">
        <p className="hd-panel__title">Вопросы по разбору</p>
        <p className="mt-1.5 text-xs text-white/50">
          Эвелина отвечает в контексте вашей карты · {ready ? formatRunesWithRub(askCost) : `${askCost} ᚢ`} за вопрос
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

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

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
