import { notFound, redirect } from "next/navigation";
import { query } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import PrintableReport from "@/components/natal/PrintableReport";
import { buildAuthHref } from "@/lib/post-auth-return";

export const metadata = { title: "Печатный астрологический отчёт", robots: { index: false, follow: false } };

export default async function NatalReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireProfileUserId();
  if (!auth) redirect(buildAuthHref("/auth/user/login", `/cabinet/astrology/reports/${encodeURIComponent(id)}/print`));
  const { rows } = await query<{
    tradition: string; report_type: string; content: string; structured_data: Record<string, unknown> | null;
    evidence_refs: unknown; birth_fingerprint: string; engine_version: string; ephemeris: string; created_at: string;
  }>(
    `SELECT tradition, report_type, content, structured_data, evidence_refs, birth_fingerprint,
            engine_version, ephemeris, created_at
     FROM natal_report_history WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, auth.profileUserId]
  );
  const report = rows[0];
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
    return [{ id: item.id, label: item.label, value: typeof item.value === "string" ? item.value : undefined,
      confidence: typeof item.confidence === "string" ? item.confidence : undefined,
      uncertainty: typeof item.uncertainty === "string" ? item.uncertainty : undefined }];
  }) : [];
  return <PrintableReport
    title={report.tradition === "vedic" ? "Отчёт Джйотиш" : "Западный натальный отчёт"}
    meta={[
      { label: "Версия / fingerprint", value: `${report.engine_version} · ${report.birth_fingerprint}` },
      { label: "Дата", value: new Date(report.created_at).toLocaleString("ru-RU") },
      { label: "Метод", value: report.ephemeris },
      { label: "Тип", value: report.report_type },
    ]}
    sections={sections}
    legacyContent={sections.length ? null : report.content}
    methodology={typeof report.structured_data?.methodology === "string" ? report.structured_data.methodology : "Legacy report: сохранённый текст исходной интерпретации."}
    disclaimer={typeof report.structured_data?.disclaimer === "string" ? report.structured_data.disclaimer : "Астрологическая интерпретация не является научным прогнозом."}
    evidence={evidence}
    returnHref={`/cabinet/astrology?tab=reports&report=${encodeURIComponent(id)}`}
  />;
}
