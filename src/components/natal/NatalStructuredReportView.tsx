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

function confidenceLabel(confidence?: string | null): string {
  if (confidence === "high") return "полнота высокая";
  if (confidence === "medium") return "полнота средняя";
  if (confidence === "low") return "полнота ограничена";
  return "";
}

export default function NatalStructuredReportView({
  sections,
  evidence = [],
  onEvidence,
  methodology,
  disclaimer,
  variant = "mystic",
  showMethodology = true,
  evidenceTone = "amber",
}: {
  sections: Section[];
  evidence?: EvidenceLike[];
  onEvidence?: (target: string) => void;
  methodology?: string | null;
  disclaimer?: string | null;
  variant?: ReadingRenderVariant;
  showMethodology?: boolean;
  evidenceTone?: "amber" | "rose";
}) {
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const chipClass =
    evidenceTone === "rose"
      ? "rounded-full border border-rose-300/20 bg-rose-300/[0.07] px-2.5 py-1 text-[11px] text-rose-100/75 transition hover:bg-rose-300/[0.13]"
      : "rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-1 text-[11px] text-amber-100/75 transition hover:bg-amber-300/[0.13]";

  return (
    <article className="natal-structured-report min-w-0 space-y-8">
      {sections.map((section) => {
        const markdown = formatNatalSectionForDisplay(section);
        if (!markdown) return null;
        const evidenceIds = [
          ...new Set(
            section.claims.flatMap((claim) => claim.evidenceIds ?? []).filter(Boolean)
          ),
        ];
        return (
          <section key={section.key} className="min-w-0">
            <div className="master-message-bubble natal-structured-report__body rounded-2xl border border-amber-300/15 bg-gradient-to-b from-white/[0.04] to-transparent px-4 py-5 sm:px-5 sm:py-6">
              <PremiumReadingBody content={markdown} variant={variant} />
            </div>
            {evidenceIds.length && (onEvidence || variant === "print") ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 px-1">
                <span className="text-[10px] uppercase tracking-wide text-white/30 print:text-black/45">
                  {variant === "print"
                    ? "Основано на рассчитанных данных"
                    : "Основано на"}
                </span>
                {evidenceIds.map((id) => {
                  const item = byId.get(id);
                  if (!item) return null;
                  const label = confidenceLabel(item.confidence);
                  const title = `${item.value ?? item.label}${
                    item.uncertainty ? ` · ${item.uncertainty}` : ""
                  }`;
                  if (variant === "print" || !onEvidence) {
                    return (
                      <span
                        key={id}
                        title={title}
                        className="rounded-full border border-black/15 px-2.5 py-1 text-[11px] text-black/55"
                      >
                        {item.label}
                        {label ? ` · ${label}` : ""}
                      </span>
                    );
                  }
                  return (
                    <button
                      type="button"
                      key={id}
                      title={title}
                      onClick={() => onEvidence(item.deepLink || id)}
                      className={chipClass}
                    >
                      Показать расчёт: {item.label}
                      {label ? ` · ${label}` : ""}
                    </button>
                  );
                })}
              </div>
            ) : null}
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
          <p className="mt-2">
            Метка полноты показывает, насколько полны исходные данные и расчёт; она не подтверждает истинность интерпретации.
          </p>
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
