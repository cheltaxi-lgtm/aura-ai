"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, Circle, Loader2, MapPin, Star } from "lucide-react";
import { bigThree, type NatalChartPayload } from "@/lib/natal/presentation";

export default function CabinetNatalChart() {
  const [chart, setChart] = useState<NatalChartPayload | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/natal-chart", { credentials: "include" })
      .then(async (response) => {
        const data = await response.json() as { enabled?: boolean; chart?: NatalChartPayload | null; error?: string };
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить карту");
        if (active) {
          setEnabled(data.enabled !== false);
          setChart(data.chart ?? null);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить карту");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const summary = useMemo(
    () => chart?.western ? bigThree(chart.western, chart.timeKnown) : [],
    [chart]
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-400/[0.09] via-white/[0.025] to-violet-500/[0.06] shadow-[0_18px_55px_rgba(0,0,0,.2)]">
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <span className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-2 text-amber-200">
          <Star className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-white">Астрологическое пространство</h2>
          {!enabled ? (
            <p className="mt-2 text-xs text-white/45">Раздел временно отключён. Данные рождения сохранены.</p>
          ) : loading ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-white/45">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Загружаем краткий обзор…
            </p>
          ) : error ? (
            <p className="mt-2 text-xs text-rose-300/80">{error}</p>
          ) : chart ? (
            <>
              <p className="mt-1 text-sm text-amber-100/70">
                {summary.length ? summary.join(" · ") : "Карта рассчитана"}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/45">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {chart.place?.label ?? "Место не указано"}
                </span>
                <ReportStatus label="Западный отчёт" ready={Boolean(chart.interpretations?.western ?? chart.interpretation)} />
                <ReportStatus label="Джйотиш" ready={Boolean(chart.interpretations?.vedic)} />
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm leading-6 text-white/50">
              Заполните данные рождения в профиле, чтобы построить карту.
            </p>
          )}
        </div>
      </div>
      {enabled ? <Link
          href="/cabinet/astrology"
          className="flex min-h-12 items-center justify-between border-t border-white/10 px-4 text-sm font-medium text-amber-100 transition hover:bg-amber-300/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300 sm:px-5"
        >
          Открыть полное пространство
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link> : null}
    </section>
  );
}

function ReportStatus({ label, ready }: { label: string; ready: boolean }) {
  const Icon = ready ? CheckCircle2 : Circle;
  return (
    <span className={ready ? "inline-flex items-center gap-1 text-emerald-300/75" : "inline-flex items-center gap-1"}>
      <Icon className="h-3 w-3" aria-hidden /> {label}: {ready ? "готов" : "нет"}
    </span>
  );
}
