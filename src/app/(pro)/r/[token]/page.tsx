"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ProResultCharts, {
  type ChartSnapshot,
} from "@/modules/pro/ui/ProResultCharts";
import ProReportSections, {
  type ProReportSectionBlock,
} from "@/modules/pro/ui/ProReportSections";

type DialogMsg = { author: "client" | "practitioner"; body: string; at: string };

type ReportPayload = {
  brandName?: string;
  question?: string;
  caseType?: string;
  blocks?: ProReportSectionBlock[];
  chartSnapshot?: ChartSnapshot | null;
  pdfAvailable?: boolean;
  siteUrl?: string;
  siteLabel?: string;
  disclaimer?: string;
  dialogMode?: string;
  dialogQuota?: number;
  questionsUsed?: number;
  dialog?: DialogMsg[];
};

export default function ProReportPublicPage() {
  const params = useParams<{ token: string }>();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [question, setQuestion] = useState("");
  const [askMsg, setAskMsg] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  // Idempotency key for the question being composed: retries reuse it so a
  // double-submit cannot consume the dialog quota twice.
  const msgIdRef = useRef<string | null>(null);
  const ASK_TIMEOUT_MS = 45_000;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/pro/public/report/${params.token}`);
      if (cancelled) return;
      if (!res.ok) {
        setErr("Отчёт недоступен");
        return;
      }
      const json = await res.json();
      if (!cancelled) setReport(json.report as ReportPayload);
    }
    void load();
    // Answers arrive asynchronously — poll lightly while the page is open.
    const timer = setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [params.token]);

  const ASK_STATUS_RU: Record<string, string> = {
    draft_pending: "Вопрос отправлен — практик утвердит ответ",
    awaiting_practitioner: "Вопрос отправлен — практик ответит лично",
    answered: "Ответ получен",
    duplicate: "Вопрос уже отправлен",
    quota_exceeded: "Лимит вопросов по этому отчёту исчерпан",
    closed: "Диалог по этому отчёту закрыт",
    escalated: "Вопрос передан практику",
  };

  async function ask() {
    setAskMsg(null);
    setAskError(null);
    setSending(true);
    if (!msgIdRef.current) {
      msgIdRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    const clientMsgId = msgIdRef.current;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/pro/public/report/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, clientMsgId }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Never append ask failures into report blocks — UI-only error state.
        setAskError(
          typeof json.message === "string"
            ? json.message
            : typeof json.error === "string"
              ? json.error
              : "Не удалось отправить вопрос. Попробуйте ещё раз."
        );
        return;
      }
      setAskMsg(
        ASK_STATUS_RU[String(json.status)] ??
          (typeof json.message === "string" ? json.message : String(json.status || "Готово"))
      );
      setQuestion("");
      msgIdRef.current = null;
      // Refresh the dialog immediately — the question (and maybe an answer) is in.
      const fresh = await fetch(`/api/pro/public/report/${params.token}`);
      if (fresh.ok) {
        const fj = await fresh.json();
        setReport(fj.report as ReportPayload);
      }
    } catch (e) {
      const timedOut =
        e instanceof DOMException && e.name === "AbortError";
      setAskError(
        timedOut
          ? "Сервер не ответил за 45 секунд. Вопрос не записан в отчёт — нажмите «Повторить»."
          : "Сеть недоступна. Попробуйте ещё раз."
      );
    } finally {
      clearTimeout(timer);
      setSending(false);
    }
  }

  async function downloadPdf() {
    setAskMsg(null);
    setPdfBusy(true);
    try {
      const res = await fetch(`/api/pro/public/report/${params.token}/pdf`, {
        credentials: "omit",
      });
      const ctype = res.headers.get("content-type") || "";
      if (!res.ok) {
        const json = ctype.includes("json")
          ? await res.json().catch(() => ({}))
          : {};
        setAskMsg(
          (json as { message?: string; error?: string }).message ||
            (json as { error?: string }).error ||
            `PDF недоступен (${res.status})`
        );
        return;
      }
      if (!ctype.includes("pdf")) {
        setAskMsg("Сервер вернул не PDF — попробуйте позже");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zovus-pro-report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setAskMsg("PDF скачан");
    } catch {
      setAskMsg("Не удалось скачать PDF — проверьте сеть и попробуйте снова");
    } finally {
      setPdfBusy(false);
    }
  }

  if (err) {
    return (
      <main className="pro-public mx-auto max-w-lg px-4 py-16 text-center">
        <p className="pro-public__eyebrow">Zovus Pro</p>
        <h1 className="pro-public__title mt-2 text-2xl">Не найдено</h1>
        <p className="mt-2 text-sm text-gray-400">{err}</p>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="pro-public mx-auto max-w-lg px-4 py-16 text-center text-sm text-gray-400">
        Загрузка…
      </main>
    );
  }

  return (
    <main
      className="pro-public pro-public--report pro-report-ready mx-auto max-w-2xl px-4 py-12"
      data-pro-report-loaded="1"
    >
      <div className="pro-public__toolbar print:hidden flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="pro-public__eyebrow">Отчёт</p>
          <h1 className="pro-public__title mt-1 text-3xl">
            {report.brandName || "Zovus Pro"}
          </h1>
          {report.caseType ? (
            <p className="mt-1 text-xs uppercase tracking-widest text-gray-500">
              {report.caseType}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {report.pdfAvailable !== false ? (
          <button
            type="button"
            className="rounded-lg border border-[color:var(--pro-border)] px-4 py-2 text-sm text-[color:var(--pro-accent-light)] disabled:opacity-50"
            disabled={pdfBusy}
            onClick={() => void downloadPdf()}
          >
            {pdfBusy ? "PDF…" : "Скачать PDF"}
          </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-[color:var(--pro-border)] px-4 py-2 text-sm text-[color:var(--pro-accent-light)]"
            onClick={() => window.print()}
          >
            Печать
          </button>
        </div>
      </div>

      {report.question ? (
        <div className="pro-report-question mt-5">
          <p className="pro-report-card__eyebrow">Запрос</p>
          <p className="mt-1 text-base text-[color:var(--pro-accent-light)]">
            {report.question}
          </p>
        </div>
      ) : null}

      <ProResultCharts snapshot={report.chartSnapshot} />

      <ProReportSections blocks={report.blocks || []} />
      {report.disclaimer ? (
        <p className="mt-10 text-xs text-gray-500">{report.disclaimer}</p>
      ) : null}

      <footer className="pro-public__site-link mt-8 border-t border-[color:var(--pro-border)] pt-4 text-center">
        <a
          href={report.siteUrl || "https://zovus.ru"}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[color:var(--pro-accent-light)] underline decoration-[color:var(--pro-border)]"
        >
          {report.siteLabel || "zovus.ru"}
        </a>
        <p className="mt-1 text-xs text-gray-500">Основной сайт Zovus</p>
      </footer>

      {report.dialogMode !== "a" ? (
        <div className="pro-public__dialog print:hidden mt-10 border-t border-[color:var(--pro-border)] pt-6">
          <h3 className="pro-public__title text-lg">Диалог по отчёту</h3>

          {report.dialog && report.dialog.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              {report.dialog.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.author === "client"
                      ? "ml-8 rounded-xl border border-[color:var(--pro-border)] bg-black/20 px-3 py-2"
                      : "mr-8 rounded-xl border border-aura-gold/25 bg-aura-gold/5 px-3 py-2"
                  }
                >
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">
                    {m.author === "client" ? "Вы" : report.brandName || "Практик"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[#ede6da]">
                    {m.body}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {typeof report.dialogQuota === "number" ? (
            <p className="mt-4 text-xs text-gray-500">
              Осталось вопросов:{" "}
              {Math.max(0, report.dialogQuota - (report.questionsUsed ?? 0))} из{" "}
              {report.dialogQuota}
            </p>
          ) : null}
          <textarea
            className="pro-field mt-3"
            rows={3}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              msgIdRef.current = null;
            }}
            placeholder="Ваш уточняющий вопрос"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-neon px-4 py-2 text-sm"
              disabled={!question.trim() || sending}
              onClick={() => void ask()}
            >
              {sending ? "Отправка…" : "Отправить"}
            </button>
            {askError ? (
              <button
                type="button"
                className="rounded-lg border border-[color:var(--pro-border)] px-3 py-2 text-sm text-[color:var(--pro-accent-light)]"
                disabled={sending || !question.trim()}
                onClick={() => void ask()}
              >
                Повторить
              </button>
            ) : null}
          </div>
          {askError ? (
            <p className="mt-2 text-sm text-red-300" role="alert">
              {askError}
            </p>
          ) : null}
          {askMsg ? (
            <p className="mt-2 text-sm text-[#e8c77e]">{askMsg}</p>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
