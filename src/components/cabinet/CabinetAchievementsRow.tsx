"use client";

import { motion } from "framer-motion";
import RuneIcon from "@/components/RuneIcon";
import { formatShortDate } from "@/lib/cabinet-utils";
import type {
  CabinetAchievementEarned,
  CabinetAchievementLocked,
} from "@/lib/cabinet-data";

interface Props {
  earned: CabinetAchievementEarned[];
  locked: CabinetAchievementLocked[];
}

export default function CabinetAchievementsRow({ earned, locked }: Props) {
  if (earned.length === 0 && locked.length === 0) {
    return (
      <section id="cabinet-achievements" className="cabinet-empty-state">
        Достижения появятся после первых сеансов с мастерами.
      </section>
    );
  }

  return (
    <section id="cabinet-achievements" className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Достижения</h2>

      {earned.length > 0 && (
        <div>
          <p className="cabinet-achievements__section-label cabinet-achievements__section-label--earned">
            Полученные
          </p>
          <div className="cabinet-achievements__scroll">
            {earned.map((a, i) => (
              <motion.div
                key={a.key}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="cabinet-achievement-card cabinet-achievement-card--earned"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-white">{a.label}</p>
                  <span className="text-xs text-emerald-400">✓ {formatShortDate(a.earnedAt)}</span>
                </div>
                <p className="mt-1 text-sm text-white/65">{a.description}</p>
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-400">
                  <RuneIcon className="h-3 w-3" />+{a.bonus} рун получено
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <p className="cabinet-achievements__section-label">Впереди</p>
          <div className="cabinet-achievements__scroll">
            {locked.map((a, i) => {
              const pct = a.progressMax > 0 ? Math.min(100, (a.progress / a.progressMax) * 100) : 0;
              const isStreak =
                a.key === "week_streak" || a.key === "month_in" || a.key === "loyal_master";

              return (
                <motion.div
                  key={a.key}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.06 }}
                  className="cabinet-achievement-card cabinet-achievement-card--locked"
                >
                  <p className="font-semibold text-white/90">
                    🔒 {a.label}
                  </p>
                  <p className="mt-1 text-sm text-white/60">{a.description}</p>
                  {isStreak && (
                    <>
                      <p className="mt-2 text-xs text-white/50">Прогресс: {a.progressLabel}</p>
                      <div className="cabinet-achievement-card__progress">
                        <div
                          className="cabinet-achievement-card__progress-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </>
                  )}
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-400/80">
                    <RuneIcon className="h-3 w-3" />+{a.bonus}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function CabinetAchievementsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-6 w-32 animate-pulse rounded bg-white/10" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 min-w-[240px] animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}
