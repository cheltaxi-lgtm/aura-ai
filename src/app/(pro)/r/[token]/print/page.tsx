"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ReportDocument from "@/components/reports/ReportDocument";
import ReportCharts from "@/components/reports/ReportCharts";
import ReportRichText from "@/components/reports/ReportRichText";
import { type ProReportSectionBlock } from "@/modules/pro/ui/ProReportSections";
import type { ChartSnapshot } from "@/modules/pro/ui/ProResultCharts";

type ReportPayload = { brandName?: string; signature?: string; question?: string; caseType?: string;
  blocks: ProReportSectionBlock[]; chartSnapshot?: ChartSnapshot | null; disclaimer?: string };
const TITLES: Record<string, string> = { matrix: "Матрица судьбы", natal: "Натальная карта", human_design: "Дизайн Человека", hd: "Дизайн Человека", tarot: "Персональный расклад" };

export default function ProReportPrintPage() {
  const params = useParams<{ token: string }>();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setReport(null);
    void (async () => {
      try {
        const res = await fetch(`/api/pro/public/report/${encodeURIComponent(params.token)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
        if (!res.ok) throw new Error("Отчёт недоступен. Возможно, срок действия ссылки истёк.");
        const json = await res.json();
        if (!json.report || !Array.isArray(json.report.blocks) || !json.report.blocks.some((b: ProReportSectionBlock) => b.body?.trim() || b.practice?.trim())) {
          throw new Error("Полный отчёт ещё не опубликован. Вернитесь к нему после подготовки.");
        }
        setReport(json.report as ReportPayload);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error && reason.name !== "TimeoutError" && reason.name !== "TypeError" ? reason.message : "Не удалось загрузить отчёт. Проверьте соединение и повторите попытку.");
      }
    })();
    return () => controller.abort();
  }, [params.token, attempt]);
  const returnHref = `/r/${encodeURIComponent(params.token)}`;
  if (!report) return <ReportDocument title={error ? "Отчёт пока недоступен" : "Подготавливаем ваш отчёт"} returnHref={returnHref} ready={false}>
    {error ? <div data-pdf-error role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(a => a + 1)}>Повторить загрузку</button></div> : <p role="status">Загружаем сохранённые материалы…</p>}
  </ReportDocument>;
  return <ReportDocument title={TITLES[report.caseType ?? ""] ?? "Ваш персональный разбор"} subtitle={report.question} brand={report.brandName || "ZOVUS PRO"} returnHref={returnHref}>
    <div className="pro-report-ready" data-pro-report-loaded="1">
      <ReportCharts snapshot={report.chartSnapshot} />
      <nav className="report-document__toc" aria-label="Содержание"><h2>Содержание</h2><ol>{report.blocks.map((b, i) => <li key={b.id}><a href={`#pro-section-${i}`}><span>{String(i + 1).padStart(2, "0")}</span>{b.title}</a></li>)}</ol></nav>
      {report.blocks.map((b, i) => <section id={`pro-section-${i}`} key={b.id} className="report-document__section"><p className="report-document__eyebrow">Раздел {String(i + 1).padStart(2, "0")}</p><h2>{b.title}</h2><ReportRichText content={b.body || ""} />{b.practice ? <aside className="pro-report-practice"><h3>Практика</h3><ReportRichText content={b.practice} /></aside> : null}</section>)}
      {report.signature ? <section className="report-document__section"><p>{report.signature}</p></section> : null}
      {report.disclaimer ? <aside className="report-document__disclaimer"><h2>Важно</h2><p>{report.disclaimer}</p></aside> : null}
    </div>
  </ReportDocument>;
}
