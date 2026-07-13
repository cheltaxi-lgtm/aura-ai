"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  RITUAL_TYPES,
  RITUAL_TYPE_KEYS,
  getMasterRitualTypes,
  resolveRitualMasterForType,
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
  /** Fixed master's ritual catalog. When null/omitted with `allTypes`, show the full catalog. */
  characterKey?: RitualMasterKey | null;
  /** Show all 7 ritual types (not just this master's) — for a "no master chosen yet" entry point. */
  allTypes?: boolean;
  onStart: (ritualType: RitualType) => void;
  onClose: () => void;
  balance?: number;
}

export default function RitualEntry({
  characterKey,
  allTypes = false,
  onStart,
  onClose,
  balance,
}: Props) {
  const [moon, setMoon] = useState<MoonData | null>(null);
  const [stats, setStats] = useState<Record<string, TypeStats>>({});
  const [loading, setLoading] = useState(true);
  const [confirmType, setConfirmType] = useState<RitualType | null>(null);
  const [typeConfig, setTypeConfig] = useState<
    Record<string, { enabled: boolean; cost: number }>
  >({});
  const catalogTypes = allTypes || !characterKey
    ? RITUAL_TYPE_KEYS
    : getMasterRitualTypes(characterKey);
  const ritualTypes = catalogTypes.filter((t) => typeConfig[t]?.enabled !== false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ritual/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.types) setTypeConfig(d.types);
      })
      .catch(() => {
        /* fall back to static defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchWithTimeout = async (url: string, ms = 8000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ms);
      try {
        return await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    (async () => {
      const types = allTypes || !characterKey ? RITUAL_TYPE_KEYS : getMasterRitualTypes(characterKey);
      try {
        const moonRes = await fetchWithTimeout("/api/ritual/moon");
        const moonData = moonRes.ok ? await moonRes.json() : getMoonPhase();
        if (!cancelled) setMoon(moonData);
      } catch {
        if (!cancelled) setMoon(getMoonPhase());
      } finally {
        if (!cancelled) setLoading(false);
      }

      try {
        const entries = await Promise.all(
          types.map(async (type) => {
            const statsMaster = characterKey ?? resolveRitualMasterForType(type);
            try {
              const res = await fetchWithTimeout(
                `/api/ritual/stats?type=${type}&characterKey=${statsMaster}`
              );
              if (!res.ok) return [type, { total: 0, signsReported: 0 }] as const;
              const data = await res.json();
              return [type, { total: data.total, signsReported: data.signsReported }] as const;
            } catch {
              return [type, { total: 0, signsReported: 0 }] as const;
            }
          })
        );
        if (!cancelled) setStats(Object.fromEntries(entries));
      } catch {
        /* stats are optional */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [characterKey, allTypes]);

  const favorableLabels = moon?.favorable
    ?.filter((t) => ritualTypes.includes(t))
    .map((t) => RITUAL_TYPES[t].label)
    .join(", ");

  const handleTypeClick = (type: RitualType) => {
    if (moon && moon.favorable.length > 0 && !moon.favorable.includes(type)) {
      setConfirmType(type);
      return;
    }
    onStart(type);
  };

  if (confirmType) {
    const cfg = RITUAL_TYPES[confirmType];
    return (
      <div className="flex max-h-[85vh] flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-2xl">🌙</p>
        <h3 className="mt-3 font-display text-lg font-bold text-white">
          Сейчас не лучший день для «{cfg.label}»
        </h3>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">
          Луна сейчас благоприятствует другому:{" "}
          {favorableLabels || "другим целям"}. Обряд всё равно подействует, но
          можно усилить эффект, выбрав более удачный день.
        </p>
        <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
          <button
            type="button"
            onClick={() => onStart(confirmType)}
            className="btn-luxe btn-luxe--md btn-luxe--gold"
          >
            Всё равно продолжить
          </button>
          <button
            type="button"
            onClick={() => setConfirmType(null)}
            className="btn-luxe btn-luxe--md btn-luxe--ghost"
          >
            Выбрать другой обряд
          </button>
        </div>
      </div>
    );
  }

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

      <div className="lux-scroll lux-scroll--above-footer flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {loading ? (
          <p className="text-center text-sm text-white/50">Загрузка…</p>
        ) : (
          <div className="space-y-3">
            {ritualTypes.map((type) => {
              const cfg = RITUAL_TYPES[type];
              const cost = typeConfig[type]?.cost ?? cfg.cost;
              const st = stats[type];
              const isFavorable = moon?.favorable?.includes(type);

              return (
                <motion.button
                  key={type}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleTypeClick(type)}
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
                      <RuneCost cost={cost} enabled className="text-sm" />
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
