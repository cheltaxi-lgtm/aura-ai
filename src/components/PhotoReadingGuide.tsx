"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  PHOTO_READING_GUIDE_STEPS,
  PHOTO_SPREAD_LAYOUT_LABELS,
} from "@/lib/photo-reading-guide";

export default function PhotoReadingGuide({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(!compact);

  return (
    <section
      className={`photo-flow-panel ${compact ? "mb-2" : "mb-3"}`}
      aria-labelledby="photo-reading-guide-title"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="photo-reading-guide-body"
        className="flex w-full items-start gap-2.5 text-left transition-colors hover:opacity-95"
      >
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-sm"
          aria-hidden
        >
          📷
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id="photo-reading-guide-title"
            className="font-display text-sm font-semibold text-white/92"
          >
            Как правильно разложить карты
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-white/45">
            {open
              ? "Сделай расклад дома, затем загрузи фото — мастер расшифрует."
              : compact
                ? "3 карты слева направо · перевёрнутые не трогать · фото сверху"
                : "Нажми, чтобы открыть пошаговую инструкцию"}
          </p>
        </div>
        <ChevronDown
          className={`mt-1 h-5 w-5 shrink-0 text-white/40 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open ? (
        <div id="photo-reading-guide-body" className="mt-3 border-t border-white/8 pt-3">
          <div className="relative mx-auto w-fit px-4 py-2" aria-hidden>
            <span className="absolute left-0 top-0 h-4 w-4 rounded-tl-sm border-l-2 border-t-2 border-aura-gold/50" />
            <span className="absolute right-0 top-0 h-4 w-4 rounded-tr-sm border-r-2 border-t-2 border-aura-gold/50" />
            <span className="absolute bottom-0 left-0 h-4 w-4 rounded-bl-sm border-b-2 border-l-2 border-aura-gold/50" />
            <span className="absolute bottom-0 right-0 h-4 w-4 rounded-br-sm border-b-2 border-r-2 border-aura-gold/50" />
            <div className="flex justify-center gap-3 sm:gap-4">
              {PHOTO_SPREAD_LAYOUT_LABELS.map((label, index) => (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <div className="flex h-[4.5rem] w-11 items-center justify-center rounded-lg border border-white/12 bg-black/25 text-[10px] font-bold text-aura-gold/75 sm:h-20 sm:w-12">
                    {index + 1}
                  </div>
                  <span className="max-w-[4.5rem] text-center text-[10px] leading-tight text-white/38">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-white/35">
            Камера строго сверху · рамка = кадр фото · перевёрнутые оставляй как легли
          </p>

          <ol className="mt-4 space-y-2.5 border-t border-white/8 pt-4">
            {PHOTO_READING_GUIDE_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3 text-sm">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-xs font-bold text-aura-gold/85"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="font-medium text-white/88">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/45">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
