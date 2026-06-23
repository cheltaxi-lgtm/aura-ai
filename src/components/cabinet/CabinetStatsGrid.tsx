"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { masterDisplay } from "@/lib/cabinet-utils";
import type { CabinetStats } from "@/lib/cabinet-data";

function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(Math.round(value * t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{display}</>;
}

const CARDS = [
  { key: "sessions", emoji: "🔮", label: "Всего сеансов", getValue: (s: CabinetStats) => s.totalSessions },
  {
    key: "master",
    emoji: "❤️",
    label: "Любимый мастер",
    getValue: (s: CabinetStats) => s.favoriteMaster,
    isText: true,
  },
  { key: "days", emoji: "📅", label: "Дней с нами", getValue: (s: CabinetStats) => s.daysWithUs },
  { key: "cards", emoji: "🃏", label: "Карт выпало", getValue: (s: CabinetStats) => s.totalCards },
] as const;

interface Props {
  stats: CabinetStats;
}

export default function CabinetStatsGrid({ stats }: Props) {
  return (
    <section id="cabinet-stats" className="cabinet-stats-grid">
      {CARDS.map((card, i) => {
        const raw = card.getValue(stats);
        const isMaster = card.key === "master";
        const master = isMaster && typeof raw === "string" ? masterDisplay(raw) : null;

        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="cabinet-stat-card"
          >
            <p className="cabinet-stat-card__label">
              {card.emoji} {card.label}
            </p>
            <p className="cabinet-stat-card__value">
              {isMaster ? (
                master ? (
                  <span className="cabinet-stat-card__value-text">
                    {master.emoji} {master.name}
                  </span>
                ) : (
                  "—"
                )
              ) : (
                <CountUp value={typeof raw === "number" ? raw : 0} />
              )}
            </p>
          </motion.div>
        );
      })}
    </section>
  );
}

export function CabinetStatsGridSkeleton() {
  return (
    <div className="cabinet-stats-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="cabinet-stat-card animate-pulse">
          <div className="h-4 w-24 rounded bg-white/10" />
          <div className="mt-3 h-8 w-16 rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}
