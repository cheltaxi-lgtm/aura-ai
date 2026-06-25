"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  RITUAL_TYPES,
  getMasterRitualTypes,
  type RitualMasterKey,
  type RitualType,
} from "@/lib/ritual-config";
import { getMoonPhase } from "@/lib/moon";
import RuneCost from "@/components/RuneCost";

interface MoonData {
  phase: string;
  sign: string;
  favorable: RitualType[];
  description: string;
}

interface TypeStats {
  total: number;
  signsReported: number;
}

interface Props {
  characterKey: RitualMasterKey;
  onStart: (ritualType: RitualType) => void;
  onClose: () => void;
  balance?: number;
}

export default function RitualEntry({
  characterKey,
  onStart,
  onClose,
  balance,
}: Props) {
  const [moon, setMoon] = useState<MoonData | null>(null);
  const [stats, setStats] = useState<Record<string, TypeStats>>({});
  const [loading, setLoading] = useState(true);
  const ritualTypes = getMasterRitualTypes(characterKey);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const moonRes = await fetch("/api/ritual/moon");
        const moonData = moonRes.ok ? await moonRes.json() : getMoonPhase();
        if (!cancelled) setMoon(moonData);

        const entries = await Promise.all(
          ritualTypes.map(async (type) => {
            const res = await fetch(
              `/api/ritual/stats?type=${type}&characterKey=${characterKey}`
            );
            if (!res.ok) return [type, { total: 0, signsReported: 0 }] as const;
            const data = await res.json();
            return [type, { total: data.total, signsReported: data.signsReported }] as const;
          })
        );
        if (!cancelled) setStats(Object.fromEntries(entries));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterKey]);

  const favorableLabels = moon?.favorable
    ?.filter((t) => ritualTypes.includes(t))
    .map((t) => RITUAL_TYPES[t].label)
    .join(", ");

  return (
    <div className="flex max-h-[85vh] flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h2 className="font-display text-lg font-bold text-white">🕯 Выбери обряд</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10"
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>

      <div className="lux-scroll flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {loading ? (
          <p className="text-center text-sm text-white/50">Загрузка…</p>
        ) : (
          <div className="space-y-3">
            {ritualTypes.map((type) => {
              const cfg = RITUAL_TYPES[type];
              const st = stats[type];
              const isFavorable = moon?.favorable?.includes(type);

              return (
                <motion.button
                  key={type}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onStart(type)}
                  className="w-full rounded-2xl border border-amber-400/40 bg-amber-950/20 p-4 text-left transition-all hover:border-amber-400"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-medium text-white">
                      {cfg.emoji} {cfg.label}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {isFavorable ? (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200">
                          луна ✦
                        </span>
                      ) : null}
                      <RuneCost cost={cfg.cost} enabled className="text-sm" />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-white/70">{cfg.desc}</p>
                  {st && st.total > 0 ? (
                    <p className="mt-2 text-xs text-amber-200/60">
                      «{st.total} человек провёл · {st.signsReported} со знаком»
                    </p>
                  ) : null}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-5 py-4 text-center text-sm text-white/60">
        {balance != null ? (
          <p>
            Баланс: <span className="text-amber-400">{balance} ᚢ</span>
          </p>
        ) : null}
        {moon ? (
          <>
            <p className="mt-1">
              Луна: {moon.phase} в {moon.sign} 🌙
            </p>
            {favorableLabels ? (
              <p className="mt-1 text-xs text-amber-200/70">
                Особенно благоприятно сейчас: {favorableLabels}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
