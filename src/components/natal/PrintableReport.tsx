import Link from "next/link";
import type { ReactNode } from "react";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import NatalStructuredReportView from "@/components/natal/NatalStructuredReportView";
import PrintButton from "./PrintButton";

type Section = { key: string; title: string; claims: Array<{ text: string; evidenceIds?: string[] }> };
type Evidence = { id: string; label: string; value?: string; confidence?: string; uncertainty?: string };

export default function PrintableReport({
  title, meta, sections, legacyContent, methodology, disclaimer, evidence = [], returnHref, visual, reportType,
}: {
  title: string;
  meta: Array<{ label: string; value: string }>;
  sections: Section[];
  legacyContent?: string | null;
  methodology?: string | null;
  disclaimer?: string | null;
  evidence?: Evidence[];
  returnHref?: string;
  reportType?: "interpretation" | "forecast";
  /** Optional chart visual rendered between header and content (e.g. bodygraph). */
  visual?: ReactNode;
}) {
  return <main data-print-report="static" className="mx-auto min-h-screen max-w-4xl [overflow-wrap:anywhere] bg-white px-4 py-6 text-black sm:px-6 sm:py-8 print:max-w-none print:px-0">
    <style>{`@media print {
      @page { size: A4 portrait; margin: 18mm; }
      body { background: white !important; }
      [data-print-section] { break-inside: avoid; }
      a { color: black; text-decoration: none; }
    }`}</style>
    <header className="border-b border-black/20 pb-5">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row"><div><Link href={returnHref ?? "/cabinet/astrology?tab=reports"} className="print:hidden text-sm text-black/65 underline underline-offset-4">← Вернуться к отчёту</Link><h1 className="mt-3 break-words text-2xl font-semibold sm:text-3xl">{title}</h1></div><PrintButton /></div>
      <dl className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">{meta.map((item) =>
        <div key={item.label}><dt className="font-semibold">{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
    </header>
    {visual ? <div data-print-visual="true" className="my-6 flex justify-center">{visual}</div> : null}
    <nav aria-label="Содержание" data-print-toc="true" className="my-7 rounded-lg border border-black/15 p-4">
      <h2 className="font-semibold">Содержание</h2>
      <ol className="mt-2 list-decimal pl-5 text-sm">
        {sections.map((section) => <li key={section.key}><a href={`#${section.key}`}>{section.title}</a></li>)}
        {methodology ? <li><a href="#methodology">Методология</a></li> : null}
        {evidence.length ? <li><a href="#evidence">Приложение: расчётные данные</a></li> : null}
      </ol>
    </nav>
    {sections.length ? (
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.key} id={section.key} data-print-section="true">
            <NatalStructuredReportView
              sections={[section]}
              evidence={evidence}
              variant="print"
              showMethodology={false}
              reportType={reportType}
            />
          </div>
        ))}
      </div>
    ) : null}
    {legacyContent ? (
      <section data-legacy-printable="true" className="leading-7">
        <PremiumReadingBody content={legacyContent} variant="print" />
      </section>
    ) : null}
    {methodology ? <section id="methodology" data-print-section="true" className="mt-8 border-t border-black/20 pt-5">
      <PremiumReadingBody content={`## Методология\n\n${methodology}${disclaimer ? `\n\n## Важно\n\n${disclaimer}` : ""}`} variant="print" />
    </section> : null}
    {evidence.length ? <section id="evidence" data-evidence-appendix="true" className="mt-8 border-t border-black/20 pt-5">
      <h2 className="text-xl font-semibold">Приложение: расчётные данные</h2>
      <ol className="mt-3 space-y-2 text-sm">{evidence.map((item) => <li key={item.id}>
        <b>{item.label}</b>{item.value ? `: ${item.value}` : ""}
        {item.confidence ? ` · полнота расчёта: ${item.confidence === "high" ? "высокая" : item.confidence === "medium" ? "средняя" : "ограниченная"}` : ""}
        {item.uncertainty ? ` · ограничение: ${item.uncertainty}` : ""}
      </li>)}</ol>
    </section> : null}
  </main>;
}
