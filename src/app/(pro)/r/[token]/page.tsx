"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProResultCharts, {
  type ChartSnapshot,
} from "@/modules/pro/ui/ProResultCharts";
import ProReportSections, {
  type ProReportSectionBlock,
} from "@/modules/pro/ui/ProReportSections";

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
  const ASK_TIMEOUT_MS = 45_000;

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/pro/public/report/${params.token}`);
      if (!res.ok) {
        setErr("Отчёт недоступен");
        return;
      }
      const json = await res.json();
      setReport(json.report as ReportPayload);
    })();
  }, [params.token]);

  async function ask() {
    setAskMsg(null);
    setAskError(null);
    setSending(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/pro/public/report/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
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
        json.status === "draft_pending"
          ? "Вопрос отправлен — практик утвердит ответ"
          : typeof json.message === "string"
            ? json.message
            : json.status === "answered"
              ? "Ответ получен"
              : String(json.status || "Готово")
      );
      setQuestion("");
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
          <h3 className="pro-public__title text-lg">Спросить по отчёту</h3>
          <textarea
            className="pro-field mt-3"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
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
