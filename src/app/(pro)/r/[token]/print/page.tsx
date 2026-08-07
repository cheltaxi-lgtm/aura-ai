"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProResultCharts, {
  type ChartSnapshot,
} from "@/modules/pro/ui/ProResultCharts";
import {
  polishProReportPlainText,
  polishProReportTitle,
} from "@/modules/pro/ai/report-plain";

type ReportBlock = { id: string; title: string; body: string };

type ReportPayload = {
  brandName?: string;
  question?: string;
  caseType?: string;
  blocks?: ReportBlock[];
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
    <main className="pro-public pro-public--report pro-report-ready mx-auto max-w-2xl px-6 py-8">
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
        <p className="mt-4 text-sm text-gray-300">Запрос: {report.question}</p>
      ) : null}
      <ProResultCharts snapshot={report.chartSnapshot} size={300} />
      <div className="mt-8 space-y-6">
        {(report.blocks || []).map((b) => (
          <section key={b.id} className="pro-public__section">
            <h2 className="pro-public__block-title text-xl">
              {polishProReportTitle(b.title)}
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
              {polishProReportPlainText(b.body)}
            </p>
          </section>
        ))}
      </div>
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
