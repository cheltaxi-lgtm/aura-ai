import { notFound } from "next/navigation";
import PrintButton from "@/components/natal/PrintButton";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import { getActivePublicReportShare } from "@/lib/services/public-report-share-service";

export const metadata = { title: "Опубликованный отчёт", robots: { index: false, follow: false } };

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getActivePublicReportShare(token);
  if (!data) notFound();
  const report = data.report;
  const sections = Array.isArray(report.sections) ? report.sections : [];
  const dimensions = Array.isArray(report.dimensions) ? report.dimensions : [];
  const aspects = Array.isArray(report.aspects) ? report.aspects : [];
  return <main className="min-h-screen bg-[#09070d] px-3 py-5 text-white sm:px-4 sm:py-10 print:bg-white print:p-0 print:text-black">
    <article className="mx-auto max-w-3xl [overflow-wrap:anywhere] rounded-2xl border border-amber-300/15 bg-white/[0.03] p-4 sm:rounded-3xl sm:p-9 print:max-w-none print:border-0 print:bg-white">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
        <div><p className="text-xs uppercase tracking-widest text-amber-200/50 print:text-black/50">Приватная публикация</p>
          <h1 className="mt-2 font-display text-2xl sm:text-3xl">{
            report.kind === "compatibility"
              ? "Совместимость по натальным картам"
              : report.kind === "relationship"
                ? "Отчёт об отношениях"
                : "Астрологический отчёт"
          }</h1></div>
        <PrintButton />
      </div>
      {typeof report.summary === "string" ? (
        <div className="mt-6">
          <PremiumReadingBody content={report.summary} />
        </div>
      ) : null}
      {typeof report.legacyContent === "string" ? (
        <div className="mt-6">
          <PremiumReadingBody content={report.legacyContent} />
        </div>
      ) : null}
      {sections.map((value, index) => {
        const section = value as { title?: string; claims?: Array<{ text?: string }> };
        return <section key={index} className="mt-7"><h2 className="font-display text-xl text-amber-100">{section.title}</h2>
          {section.claims?.map((claim, claimIndex) =>
            claim.text ? (
              <div key={claimIndex} className="mt-3">
                <PremiumReadingBody content={claim.text} />
              </div>
            ) : null
          )}</section>;
      })}
      {dimensions.length ? <section className="mt-7"><h2 className="font-display text-xl text-amber-100">Измерения</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{dimensions.map((value, index) => {
          const item = value as { label?: string; band?: string; index?: number };
          return <p key={index} className="rounded-lg bg-white/[0.04] p-3 text-sm">{item.label}: {item.band} · {item.index}/100</p>;
        })}</div></section> : null}
      {aspects.length ? <section className="mt-7"><h2 className="font-display text-xl text-amber-100">Поддерживающие данные</h2>
        <ul className="mt-3 space-y-1 text-sm text-white/60">{aspects.map((value, index) => {
          const item = value as { label?: string };
          return <li key={index}>{item.label}</li>;
        })}</ul></section> : null}
      {report.methodology ? <section className="mt-8 border-t border-white/10 pt-5 text-sm text-white/50">
        <h2 className="font-medium text-white/70">Методология</h2>
        <p className="mt-2">{typeof report.methodology === "string" ? report.methodology : JSON.stringify(report.methodology)}</p>
      </section> : null}
      <p className="mt-8 text-xs text-white/30">Ссылка истекает {new Date(data.expiresAt).toLocaleString("ru-RU")}.</p>
    </article>
  </main>;
}
