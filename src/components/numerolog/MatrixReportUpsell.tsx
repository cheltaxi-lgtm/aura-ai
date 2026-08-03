"use client";

import type { NumerologToolId } from "@/lib/numerology/tools";

type MatrixReportUpsellProps = {
  onOpenTool?: (toolId: NumerologToolId) => void;
};

const NEXT_STEPS: {
  toolId: NumerologToolId;
  label: string;
  hint: string;
}[] = [
  {
    toolId: "compatibility",
    label: "Совместимость",
    hint: "Два человека в числах",
  },
  {
    toolId: "personal_year",
    label: "Личный год",
    hint: "Тема текущего цикла",
  },
];

/**
 * Single next-step CTAs after Full Matrix report (ecosystem upsell, not a calculator pack).
 */
export default function MatrixReportUpsell({ onOpenTool }: MatrixReportUpsellProps) {
  return (
    <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-amber-200/80">
        Дальше по вашему запросу
      </p>
      <p className="mt-1 text-xs leading-relaxed text-white/55">
        Матрица сохранена. Можно задать вопросы Эвелине или открыть один следующий разбор.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {NEXT_STEPS.map((step) => (
          <button
            key={step.toolId}
            type="button"
            onClick={() => {
              if (onOpenTool) {
                onOpenTool(step.toolId);
                return;
              }
              window.location.assign(`/?numerolog=1&tool=${step.toolId}`);
            }}
            className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-left transition hover:border-amber-300/40 hover:bg-amber-400/10"
          >
            <span className="block text-sm font-medium text-white">{step.label}</span>
            <span className="block text-[11px] text-white/45">{step.hint}</span>
          </button>
        ))}
        <a
          href="/cabinet/astrology"
          className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-left transition hover:border-amber-300/40 hover:bg-amber-400/10"
        >
          <span className="block text-sm font-medium text-white">Натальная карта</span>
          <span className="block text-[11px] text-white/45">Глубже через астрологию</span>
        </a>
      </div>
    </div>
  );
}
