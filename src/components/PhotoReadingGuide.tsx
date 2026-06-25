"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  PHOTO_READING_GUIDE_STEPS,
  PHOTO_SPREAD_LAYOUT_LABELS,
} from "@/lib/photo-reading-guide";

export default function PhotoReadingGuide({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);

  const toggle = () => setOpen((prev) => !prev);

  return (
    <section
      className="mb-5 rounded-xl border border-aura-gold/35 bg-gradient-to-b from-aura-gold/10 to-black/30 shadow-[0_0_24px_rgba(212,175,55,0.06)]"
      aria-labelledby="photo-reading-guide-title"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="photo-reading-guide-body"
        className="flex w-full items-start gap-2 p-4 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="text-lg leading-none" aria-hidden>
          📷
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id="photo-reading-guide-title"
            className="font-display text-sm font-semibold text-aura-gold"
          >
            Как правильно разложить карты
          </h3>
          <p className="mt-1 text-xs text-gray-400">
            {open
              ? "Сделай расклад дома, затем загрузи фото — мастер расшифрует."
              : compact
                ? "3 карты слева направо · перевёрнутые не трогать · фото сверху"
                : "Нажми, чтобы открыть пошаговую инструкцию"}
          </p>
        </div>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 shrink-0 text-aura-gold/70 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {open ? (
        <div id="photo-reading-guide-body" className="border-t border-white/10 px-4 pb-4 pt-3">
          <div className="flex justify-center gap-3 sm:gap-4" aria-hidden>
            {PHOTO_SPREAD_LAYOUT_LABELS.map((label, index) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="flex h-[4.5rem] w-11 items-center justify-center rounded-md border border-aura-gold/45 bg-black/40 text-[10px] font-bold text-aura-gold/70 sm:h-20 sm:w-12">
                  {index + 1}
                </div>
                <span className="max-w-[4.5rem] text-center text-[10px] leading-tight text-gray-500">
                  {label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-gray-500">
            Слева → направо · перевёрнутые оставляй как легли
          </p>

          <ol className="mt-4 space-y-2.5 border-t border-white/10 pt-4">
            {PHOTO_READING_GUIDE_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3 text-sm">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-aura-gold/40 bg-aura-gold/15 text-xs font-bold text-aura-gold"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="font-medium text-white">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
