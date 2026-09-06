import ReportCharts from "@/components/reports/ReportCharts";
import { notFound, redirect } from "next/navigation";
import { getNatalPrintRecord } from "@/lib/reports/natal-print-data";
import { requireProfileUserId } from "@/lib/require-auth";
import PrintableReport from "@/components/natal/PrintableReport";
import { buildAuthHref } from "@/lib/post-auth-return";

export const metadata = { title: "Печатный астрологический отчёт", robots: { index: false, follow: false } };

export default async function NatalReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireProfileUserId();
  if (!auth) redirect(buildAuthHref("/auth/user/login", `/cabinet/astrology/reports/${encodeURIComponent(id)}/print`));
  const report = await getNatalPrintRecord(auth.profileUserId, id);
  if (!report) notFound();
  const rawSections = Array.isArray(report.structured_data?.sections) ? report.structured_data.sections : [];
  const sections = rawSections.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const section = value as { key?: unknown; title?: unknown; claims?: unknown };
    if (typeof section.key !== "string" || typeof section.title !== "string" || !Array.isArray(section.claims)) return [];
    return [{ key: section.key, title: section.title, claims: section.claims.flatMap((claim) => {
      if (!claim || typeof claim !== "object" || typeof (claim as { text?: unknown }).text !== "string") return [];
      const item = claim as { text: string; evidenceIds?: unknown };
      return [{ text: item.text, evidenceIds: Array.isArray(item.evidenceIds)
        ? item.evidenceIds.filter((entry): entry is string => typeof entry === "string") : [] }];
    }) }];
  });
  const evidence = Array.isArray(report.evidence_refs) ? report.evidence_refs.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.label !== "string") return [];
    // Legacy unknown-time rows can still store rising/house evidence. Never print
    // angles or houses as if they were reliable facts.
    const haystack = `${item.id} ${item.label} ${typeof item.sourcePath === "string" ? item.sourcePath : ""}`.toLowerCase();
    if (
      report.time_known === false &&
      /(rising|midheaven|ascendant|асцендент|\bmc\b|house|дом|лагна|lagna)/i.test(haystack)
    ) {
      return [];
    }
    return [{ id: item.id, label: item.label, value: typeof item.value === "string" ? item.value : undefined,
      confidence: typeof item.confidence === "string" ? item.confidence : undefined,
      uncertainty: typeof item.uncertainty === "string" ? item.uncertainty : undefined }];
  }) : [];
  return <PrintableReport
    title={report.tradition === "vedic" ? "Отчёт Джйотиш" : "Западный натальный отчёт"}
    meta={[
      { label: "Традиция", value: report.tradition === "vedic" ? "Джйотиш" : "Западная астрология" },
      { label: "Дата", value: new Date(report.created_at).toLocaleString("ru-RU") },
      { label: "Метод", value: report.ephemeris },
      { label: "Отчёт", value: report.report_type.startsWith("forecast") ? "Персональный прогноз" : "Натальная интерпретация" },
    ]}
    visual={report.tradition === "western" && report.chart_data?.western ? <ReportCharts snapshot={{ western: report.chart_data.western, timeKnown: report.time_known ?? false }} /> : undefined}
    sections={sections}
    legacyContent={sections.length ? null : report.content}
    methodology={typeof report.structured_data?.methodology === "string" ? report.structured_data.methodology : "Сохранённый текст исходной интерпретации."}
    disclaimer={typeof report.structured_data?.disclaimer === "string" ? report.structured_data.disclaimer : "Астрологическая интерпретация не является научным прогнозом."}
    evidence={evidence}
    reportType={report.report_type === "forecast" || report.report_type.startsWith("forecast:") ? "forecast" : "interpretation"}
    returnHref={`/cabinet/astrology?tab=reports&report=${encodeURIComponent(id)}`}
  />;
}
