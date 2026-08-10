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
  siteUrl?: string;
  siteLabel?: string;
  disclaimer?: string;
};

/** Print / PDF render surface — no dialog chrome. */
export default function ProReportPrintPage() {
  const params = useParams<{ token: string }>();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

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

  if (err) {
    return (
      <main className="pro-public mx-auto max-w-2xl px-6 py-10 text-center">
        <p>{err}</p>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="pro-public mx-auto max-w-2xl px-6 py-10 text-sm text-gray-400">
        Загрузка…
      </main>
    );
  }

  return (
    <main
      className="pro-public pro-public--report pro-report-ready mx-auto max-w-2xl px-6 py-8"
      data-pro-report-loaded="1"
    >
      <p className="pro-public__eyebrow">Отчёт</p>
      <h1 className="pro-public__title mt-1 text-3xl">
        {report.brandName || "Zovus Pro"}
      </h1>
      {report.caseType ? (
        <p className="mt-1 text-xs uppercase tracking-widest text-gray-500">
          {report.caseType}
        </p>
      ) : null}
      {report.question ? (
        <div className="pro-report-question mt-5">
          <p className="pro-report-card__eyebrow">Запрос</p>
          <p className="mt-1 text-base text-[color:var(--pro-accent-light)]">
            {report.question}
          </p>
        </div>
      ) : null}
      <ProResultCharts snapshot={report.chartSnapshot} size={300} />
      <ProReportSections blocks={report.blocks || []} variant="print" />
      {report.disclaimer ? (
        <p className="mt-10 text-xs text-gray-500">{report.disclaimer}</p>
      ) : null}
      <footer className="pro-public__site-link mt-8 border-t border-[color:var(--pro-border)] pt-4 text-center">
        <p className="text-sm text-[color:var(--pro-accent-light)]">
          {report.siteLabel || "zovus.ru"}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {report.siteUrl || "https://zovus.ru"}
        </p>
        <p className="mt-1 text-xs text-gray-500">Основной сайт Zovus</p>
      </footer>
    </main>
  );
}
