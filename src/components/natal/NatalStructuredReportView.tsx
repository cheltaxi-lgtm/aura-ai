"use client";

import PremiumReadingBody from "@/components/PremiumReadingBody";
import type { ReadingRenderVariant } from "@/components/ChatMessageRenderer";
import { formatNatalSectionForDisplay } from "@/lib/natal/report";

type Claim = { text: string; evidenceIds?: string[] };
type Section = { key: string; title: string; claims: Claim[] };

type EvidenceLike = {
  id: string;
  label: string;
  value?: string | null;
  confidence?: "high" | "medium" | "low" | string | null;
  uncertainty?: string | null;
  deepLink?: string | null;
};

export default function NatalStructuredReportView({
  sections,
  evidence = [],
  methodology,
  disclaimer,
  variant = "mystic",
  showMethodology = true,
  reportType,
}: {
  sections: Section[];
  evidence?: EvidenceLike[];
  methodology?: string | null;
  disclaimer?: string | null;
  variant?: ReadingRenderVariant;
  showMethodology?: boolean;
  reportType?: "interpretation" | "forecast";
}) {
  return (
    <article className="natal-structured-report min-w-0 space-y-8">
      {sections.map((section) => {
        const markdown = formatNatalSectionForDisplay(section, reportType);
        if (!markdown) return null;
        return (
          <section key={section.key} className="min-w-0">
            <div className="master-message-bubble natal-structured-report__body rounded-2xl border border-amber-300/15 bg-gradient-to-b from-white/[0.04] to-transparent px-4 py-5 sm:px-5 sm:py-6">
              <PremiumReadingBody content={markdown} variant={variant} />
            </div>
          </section>
        );
      })}

      {showMethodology && (methodology || disclaimer) ? (
        <aside className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-4 text-xs leading-5 text-white/45 print:border-black/15 print:bg-transparent print:text-black/60">
          {methodology ? (
            <p>
              <span className="text-cyan-100/65 print:text-black/70">Методология:</span>{" "}
              {methodology}
            </p>
          ) : null}
          {disclaimer ? (
            <p className="mt-2">
              <span className="text-amber-100/65 print:text-black/70">Ограничения:</span>{" "}
              {disclaimer}
            </p>
          ) : null}
          {evidence.some((item) => item.uncertainty) ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-white/55 print:text-black/55">
                Ограничения расчёта
              </summary>
              <ul className="mt-2 space-y-1">
                {evidence
                  .filter((item) => item.uncertainty)
                  .slice(0, 12)
                  .map((item) => (
                    <li key={item.id}>
                      • {item.label}: {item.uncertainty}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
        </aside>
      ) : null}
    </article>
  );
}
