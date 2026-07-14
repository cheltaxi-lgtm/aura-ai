"use client";

import type { ReactNode } from "react";
import type { GuideCopy } from "@/lib/natal/explainers";

export function AstrologyGuide({ guide, className = "" }: { guide: GuideCopy; className?: string }) {
  return (
    <aside aria-label="Справка для начинающих" className={`isolate rounded-2xl border border-amber-300/15 bg-gradient-to-br from-amber-300/[0.09] to-violet-300/[0.035] shadow-[0_12px_36px_rgba(0,0,0,.1)] ${className}`}>
      <div className="border-b border-white/10 px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[10px] font-medium uppercase leading-relaxed tracking-[.14em] text-amber-200/55">Для первого знакомства</p>
        <h2 className="mt-2 font-display text-lg font-semibold leading-snug text-amber-50">{guide.title}</h2>
      </div>
      <div className="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-sm leading-6 text-white/65">{guide.intro}</p>
        <details className="border-t border-white/10 pt-3">
          <summary className="flex min-h-11 cursor-pointer items-center py-1 text-sm font-medium text-amber-100/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
            Как это понимать?
          </summary>
          <p className="pt-2 text-xs leading-5 text-white/50">{guide.detail}</p>
        </details>
      </div>
    </aside>
  );
}

export function SectionIntroduction({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={`Объяснение: ${title}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm leading-6 text-white/65 sm:px-4 sm:py-4">
      <h3 className="text-sm font-medium leading-snug text-amber-100/90">{title}</h3>
      <div className="mt-2.5 space-y-2 leading-6">{children}</div>
    </section>
  );
}

export function PanelBlock({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-4 ${className}`}>{children}</div>;
}

export function ExplainTerm({ term, children }: { term: string; children: ReactNode }) {
  return (
    <span className="relative inline whitespace-nowrap align-baseline">
      <details className="group inline">
        <summary className="inline cursor-pointer list-none rounded border-b border-dashed border-amber-200/45 text-amber-100/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 [&::-webkit-details-marker]:hidden">
          {term}
        </summary>
        <span className="absolute left-0 top-[calc(100%+0.4rem)] z-30 hidden min-w-[12rem] max-w-[min(18rem,80vw)] rounded-lg border border-white/10 bg-[#15121b] p-3 text-sm leading-6 text-white/70 shadow-lg group-open:block">
          {children}
        </span>
      </details>
    </span>
  );
}

export function PersonalMeaning({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-lg border border-cyan-300/10 bg-cyan-300/[0.035] px-3 py-2.5 text-xs leading-5 text-cyan-50/65">
      <span className="font-medium text-cyan-100/85">Как это можно понимать: </span>{children}
    </p>
  );
}
