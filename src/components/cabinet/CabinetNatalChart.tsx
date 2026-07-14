"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, RefreshCw, Sparkles, Star } from "lucide-react";
import NatalChartWheel from "@/components/natal/NatalChartWheel";
import { usePaywall } from "@/contexts/PaywallContext";
import { RUNE_ACTION_LABELS } from "@/lib/rune-costs";
import { useRuneConfig } from "@/lib/useRuneConfig";
import type { NatalTradition } from "@/lib/natal/types";

type NatalChartPayload = {
  timeKnown: boolean;
  place: { label: string; timezone: string } | null;
  western: Record<string, unknown> | null;
  vedic: Record<string, unknown> | null;
  transits?: Array<{ planet: string; note: string; kind: string }>;
  warnings: string[];
  interpretation?: string;
  computedAt: string | null;
};

function signName(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const sign = (body as Record<string, unknown>).sign;
  if (typeof sign === "string") return sign;
  if (sign && typeof sign === "object") {
    const name = (sign as { name?: string }).name;
    if (typeof name === "string") return name;
  }
  return null;
}

function westernSummary(w: Record<string, unknown>): string[] {
  const lines: string[] = [];
  if (typeof w.bigThree === "string") lines.push(w.bigThree);
  for (const [key, label] of [
    ["sun", "Солнце"],
    ["moon", "Луна"],
    ["rising", "Асцендент"],
  ] as const) {
    const sign = signName(w[key]);
    if (sign) lines.push(`${label}: ${sign}`);
  }
  return lines;
}

function vedicSummary(v: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const moonSign = v.moonSign as Record<string, unknown> | undefined;
  if (moonSign && typeof moonSign.summary === "string") lines.push(moonSign.summary);
  const dasha = v.dasha as Record<string, unknown> | undefined;
  const current = dasha?.current as Record<string, unknown> | undefined;
  if (current?.maha && current?.antar) {
    lines.push(`Даша: ${current.maha} / ${current.antar}`);
  }
  const nakshatra = v.nakshatra as Record<string, unknown> | undefined;
  if (nakshatra && typeof nakshatra.name === "string") {
    lines.push(`Накшатра: ${nakshatra.name}`);
  }
  return lines;
}

export default function CabinetNatalChart() {
  const { openPaywall } = usePaywall();
  const { config: runeConfig, cost: runeCost } = useRuneConfig();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [chart, setChart] = useState<NatalChartPayload | null>(null);
  const [tradition, setTradition] = useState<NatalTradition>("western");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [interpretLoading, setInterpretLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (recompute = false) => {
    setError("");
    try {
      const res = await fetch("/api/natal-chart", {
        method: recompute ? "POST" : "GET",
        credentials: "include",
        headers: recompute ? { "Content-Type": "application/json" } : undefined,
        body: recompute ? JSON.stringify({ action: "invalidate" }) : undefined,
      });
      const data = (await res.json()) as {
        enabled?: boolean;
        chart?: NatalChartPayload | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Не удалось загрузить карту рождения.");
        return;
      }
      setEnabled((previous) => data.enabled ?? previous ?? true);
      setChart(data.chart ?? null);
    } catch {
      setError("Не удалось загрузить карту рождения.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requestInterpretation = async () => {
    setInterpretLoading(true);
    setError("");
    try {
      const res = await fetch("/api/natal-chart/interpretation", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        interpretation?: string;
        error?: string;
        balance?: number;
        cost?: number;
      };
      if (res.status === 402) {
        openPaywall({
          currentBalance: data.balance ?? 0,
          onClose: () => void load(),
        });
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Не удалось получить трактовку.");
        return;
      }
      if (data.interpretation) {
        setChart((prev) => (prev ? { ...prev, interpretation: data.interpretation } : prev));
      }
    } catch {
      setError("Ошибка сети при запросе трактовки.");
    } finally {
      setInterpretLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <div className="flex items-center justify-center gap-2 text-sm text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка карты рождения…
        </div>
      </section>
    );
  }

  if (!enabled) return null;

  const cost = runeCost("NATAL_READING");

  return (
    <section
      aria-label="Карта рождения"
      className="rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-500/[0.06] to-transparent p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-amber-300">
            <Star className="h-4 w-4" />
            <h2 className="text-sm font-medium text-white">Карта рождения</h2>
          </div>
          <p className="mt-1 text-xs text-white/45">
            Западная и ведическая традиции — расчёт движка, без «угаданных» градусов.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            void load(true);
          }}
          disabled={refreshing}
          aria-label="Пересчитать карту рождения"
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Пересчитать
        </button>
      </div>

      {!chart?.western && !chart?.vedic ? (
        <p className="mt-4 text-sm text-white/50">
          Укажите дату, город и по возможности время рождения в профиле — карта появится автоматически.
        </p>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 space-y-5">
          {chart.place ? (
            <p className="text-center text-xs text-white/40">
              {chart.place.label} · {chart.place.timezone}
              {!chart.timeKnown ? " · время приблизительно" : ""}
              {chart.computedAt
                ? ` · рассчитано ${new Date(chart.computedAt).toLocaleDateString("ru-RU")}`
                : ""}
            </p>
          ) : null}

          <div className="flex justify-center gap-2" role="tablist" aria-label="Традиция расчёта">
            {(["western", "vedic"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTradition(t)}
                role="tab"
                aria-selected={tradition === t}
                disabled={t === "western" ? !chart.western : !chart.vedic}
                className={`rounded-full px-4 py-1.5 text-xs transition ${
                  tradition === t
                    ? "bg-amber-500/20 text-amber-200 border border-amber-500/40"
                    : "border border-white/10 text-white/50 hover:text-white/80"
                }`}
              >
                {t === "western" ? "Западная" : "Ведическая"}
              </button>
            ))}
          </div>

          {tradition === "western" && chart.western ? (
            <div className="space-y-4">
              <NatalChartWheel western={chart.western} />
              <ul className="space-y-1 text-center text-sm text-white/75">
                {westernSummary(chart.western).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {tradition === "vedic" && chart.vedic ? (
            <ul className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
              {vedicSummary(chart.vedic).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}

          {chart.transits?.some((t) => t.kind === "aspect_hit" || t.kind === "sign_change") ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-200/70">Транзиты</p>
              <ul className="mt-2 space-y-1 text-xs text-white/60">
                {chart.transits
                  .filter((t) => t.kind === "aspect_hit")
                  .slice(0, 4)
                  .map((t, idx) => (
                    <li key={`asp-${idx}`}>{t.note}</li>
                  ))}
                {chart.transits
                  .filter((t) => t.kind === "sign_change")
                  .slice(0, 3)
                  .map((t) => (
                    <li key={t.planet}>{t.note}</li>
                  ))}
              </ul>
            </div>
          ) : null}

          {(chart.warnings ?? []).length > 0 ? (
            <p className="text-[11px] text-white/35">{(chart.warnings ?? []).join(" · ")}</p>
          ) : null}

          {chart.interpretation ? (
            <div className="rounded-xl border border-amber-500/20 bg-black/30 p-4">
              <p className="text-xs font-medium text-amber-200/80">Полная трактовка</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                {chart.interpretation}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void requestInterpretation()}
              disabled={interpretLoading}
              className="btn-neon flex w-full items-center justify-center gap-2 py-3 text-sm disabled:opacity-60"
            >
              {interpretLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {runeConfig.labels.NATAL_READING ?? RUNE_ACTION_LABELS.NATAL_READING} ({cost} ᚢ)
            </button>
          )}
        </motion.div>
      )}

      {error ? (
        <p className="mt-3 text-sm text-red-400" role="status" aria-live="polite">
          {error}
        </p>
      ) : null}
    </section>
  );
}
