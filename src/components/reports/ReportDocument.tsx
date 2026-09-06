import Link from "next/link";
import type { ReactNode } from "react";
import PrintButton from "@/components/natal/PrintButton";

export default function ReportDocument({ title, subtitle, meta = [], children, returnHref, brand = "ZOVUS", ready = true }: {
  title: string; subtitle?: string; meta?: Array<{ label: string; value: string }>; children: ReactNode;
  returnHref?: string; brand?: string; ready?: boolean;
}) {
  return <main className="report-document" data-print-report="static" data-pdf-ready={ready ? "true" : undefined}>
    <div className="report-document__toolbar" data-pdf-toolbar>
      <Link href={returnHref ?? "/cabinet"}>← Вернуться к отчёту</Link><PrintButton />
    </div>
    <header className="report-document__cover">
      <div className="report-document__brand"><span>{brand}</span><span>ПЕРСОНАЛЬНЫЙ ОТЧЁТ</span></div>
      <div className="report-document__rule" />
      <p className="report-document__eyebrow">Внимание к вашей истории</p>
      <h1>{title}</h1>
      {subtitle ? <p className="report-document__subtitle">{subtitle}</p> : null}
      {meta.length ? <dl className="report-document__meta">{meta.map((item, i) => <div key={`${item.label}-${i}`}>
        <dt>{item.label}</dt><dd>{item.value}</dd>
      </div>)}</dl> : null}
    </header>
    <div className="report-document__content">{children}</div>
    <footer className="report-document__closing"><span>ZOVUS</span><p>Сохраните то, что откликается. Возвращайтесь к отчёту, когда появятся новые вопросы.</p><small>zovus.ru</small></footer>
  </main>;
}
