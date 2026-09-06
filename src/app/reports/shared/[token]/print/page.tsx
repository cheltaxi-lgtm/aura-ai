import { notFound } from "next/navigation";
import CompositeSnapshot from "@/components/reports/CompositeSnapshot";
import type { CompositeChart } from "@/lib/natal/composite";
import PrintableReport from "@/components/natal/PrintableReport";
import { getActivePublicReportShare } from "@/lib/services/public-report-share-service";

export const metadata = { title: "Опубликованный отчёт · PDF", robots: { index: false, follow: false } };
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export default async function SharedReportPrintPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Only the consent-filtered public payload; never reload the private source.
  const data = await getActivePublicReportShare(token);
  if (!data) notFound();
  const report = data.report;
  const sections = (Array.isArray(report.sections) ? report.sections : []).flatMap((value, index) => {
    const s = record(value);
    if (!s || !Array.isArray(s.claims)) return [];
    return [{ key: typeof s.key === "string" ? s.key : `section-${index}`, title: typeof s.title === "string" ? s.title : `Раздел ${index + 1}`,
      claims: s.claims.flatMap(v => { const c = record(v); return c && typeof c.text === "string" ? [{ text: c.text }] : []; }) }];
  });
  const dimensions = (Array.isArray(report.dimensions) ? report.dimensions : []).flatMap(v => {
    const d = record(v); return d && typeof d.label === "string" ? [{ text: `${d.label}: ${d.band ?? ""}${typeof d.index === "number" ? ` · ${d.index}/100` : ""}` }] : [];
  });
  if (dimensions.length) sections.push({ key: "dimensions", title: "Измерения связи", claims: dimensions });
  const aspects = (Array.isArray(report.aspects) ? report.aspects : []).flatMap((v, i) => {
    const a = record(v); return a && typeof a.label === "string" ? [{ id: `aspect-${i}`, label: a.label }] : [];
  });
  const composite = record(report.composite);
  const method = record(report.methodology);
  const publicEvidence = (Array.isArray(report.evidence) ? report.evidence : []).flatMap((v,i) => { const e = record(v); return e && typeof e.label === "string" ? [{id: `evidence-${i}`, label: e.label, value: typeof e.value === "string" ? e.value : undefined}] : []; });
  const body = [report.summary, report.legacyContent].filter((v): v is string => typeof v === "string" && Boolean(v.trim())).join("\n\n");
  return <PrintableReport title={report.kind === "compatibility" ? "Совместимость по натальным картам" : report.kind === "relationship" ? "Отчёт об отношениях" : "Астрологический отчёт"}
    meta={[{ label: "Доступ", value: "Разделы, выбранные владельцем для публикации" }, { label: "Ссылка действительна до", value: new Date(data.expiresAt).toLocaleDateString("ru-RU") }]}
    visual={composite && Array.isArray(composite.bodies) ? <CompositeSnapshot chart={composite as unknown as CompositeChart} /> : null}
    sections={sections} legacyContent={body || null} evidence={[...aspects, ...publicEvidence]}
    disclaimer={typeof report.disclaimer === "string" ? report.disclaimer : null}
    methodology={typeof report.methodology === "string" ? report.methodology : [method?.description, method?.limitation].filter(v => typeof v === "string").join("\n\n") || null}
    returnHref={`/reports/shared/${encodeURIComponent(token)}`} />;
}
