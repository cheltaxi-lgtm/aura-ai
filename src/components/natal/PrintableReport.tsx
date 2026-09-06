import type { ReactNode } from "react";
import ReportRichText from "@/components/reports/ReportRichText";
import ReportDocument from "@/components/reports/ReportDocument";

type Section = { key: string; title: string; claims: Array<{ text: string; evidenceIds?: string[] }> };
type Evidence = { id: string; label: string; value?: string; confidence?: string; uncertainty?: string };

export default function PrintableReport({ title, meta, sections, legacyContent, methodology, disclaimer, evidence = [], returnHref, visual }: {
  title: string; meta: Array<{ label: string; value: string }>; sections: Section[];
  legacyContent?: string | null; methodology?: string | null; disclaimer?: string | null;
  evidence?: Evidence[]; returnHref?: string; reportType?: "interpretation" | "forecast"; visual?: ReactNode;
}) {
  const hasContents = sections.length > 0 || Boolean(methodology) || evidence.length > 0;
  return <ReportDocument title={title} meta={meta} returnHref={returnHref}>
    {visual ? <div data-print-visual="true" className="report-document__visual">{visual}</div> : null}
    {hasContents ? <nav aria-label="Содержание" data-print-toc="true" className="report-document__toc">
      <p className="report-document__eyebrow">Навигация по отчёту</p><h2>Содержание</h2>
      <ol>{sections.map((section, index) => <li key={section.key}><a href={`#${section.key}`}><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</a></li>)}
        {legacyContent && !sections.length ? <li><a href="#interpretation"><span>01</span>Ваш разбор</a></li> : null}
        {methodology ? <li><a href="#methodology"><span>М</span>Методология</a></li> : null}
        {evidence.length ? <li><a href="#evidence"><span>П</span>Расчётные данные</a></li> : null}
      </ol>
    </nav> : null}
    {sections.map((section, index) => <div key={section.key} id={section.key} data-print-section="true" className="report-document__section">
      <p className="report-document__eyebrow">Раздел {String(index + 1).padStart(2, "0")}</p>
      <h2>{section.title}</h2>
      {section.claims.map((claim, i) => <ReportRichText key={i} content={claim.text} />)}
    </div>)}
    {legacyContent ? <section id="interpretation" data-legacy-printable="true" className="report-document__section"><ReportRichText content={legacyContent} /></section> : null}
    {methodology ? <section id="methodology" data-print-section="true" className="report-document__section report-document__method"><h2>Методология</h2><ReportRichText content={methodology} /></section> : null}
    {disclaimer ? <aside className="report-document__disclaimer"><h2>Важно</h2><p>{disclaimer}</p></aside> : null}
    {evidence.length ? <section id="evidence" data-evidence-appendix="true" className="report-document__section"><p className="report-document__eyebrow">Приложение</p><h2>Расчётные данные</h2>
      <dl className="report-document__evidence">{evidence.map(item => <div key={item.id}><dt>{item.label}</dt><dd>{item.value}
        {item.confidence ? <small>Полнота расчёта: {item.confidence === "high" ? "высокая" : item.confidence === "medium" ? "средняя" : "ограниченная"}</small> : null}
        {item.uncertainty ? <small>{item.uncertainty}</small> : null}
      </dd></div>)}</dl>
    </section> : null}
  </ReportDocument>;
}
