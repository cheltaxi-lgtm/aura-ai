"use client";

import { useEffect, useState } from "react";
import { GATE_NAMES_RU } from "@/lib/human-design";

interface DayRow {
  at: string;
  dateLabel: string;
  sun?: { gate: number; line: number };
  earth?: { gate: number; line: number };
  moon?: { gate: number; line: number };
}

/** Week-ahead transit habit strip for the HD hub. */
export default function HdTransitWeek() {
  const [days, setDays] = useState<DayRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/human-design/transits?days=7")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          week?: Array<{
            at: string;
            dateLabel: string;
            activations: Array<{ body: string; gate: number; line: number }>;
          }>;
        } | null) => {
          if (cancelled) return;
          if (!d?.week?.length) {
            setError(true);
            return;
          }
          setDays(
            d.week.map((w) => ({
              at: w.at,
              dateLabel: w.dateLabel,
              sun: w.activations.find((a) => a.body === "sun"),
              earth: w.activations.find((a) => a.body === "earth"),
              moon: w.activations.find((a) => a.body === "moon"),
            }))
          );
        }
      )
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || !days) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-amber-500/20 bg-amber-500/[0.05] p-5">
      <p className="text-[0.625rem] font-medium uppercase tracking-[0.25em] text-amber-200/60">
        Транзиты · неделя вперёд
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {days.map((d) => (
          <li
            key={d.at}
            className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0"
          >
            <span className="font-medium text-amber-100/85">{d.dateLabel}</span>
            <span className="text-white/70">
              {d.sun && (
                <>
                  ☉ {d.sun.gate}.{d.sun.line}{" "}
                  <span className="text-white/45">{GATE_NAMES_RU[d.sun.gate] ?? ""}</span>
                </>
              )}
              {d.moon && (
                <span className="ml-3 text-white/55">
                  ☽ {d.moon.gate}.{d.moon.line}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[0.6875rem] leading-relaxed text-white/45">
        Солнце и Луна на каждый день — опора для привычки смотреть неделю целиком, а не только «сейчас».
      </p>
    </div>
  );
}
