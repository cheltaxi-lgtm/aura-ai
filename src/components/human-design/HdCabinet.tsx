"use client";

import { useCallback, useEffect, useState } from "react";
import HdCalculator from "./HdCalculator";
import HdChartView, { type HdChartPayload } from "./HdChartView";
import HdReportPanel from "./HdReportPanel";
import { TYPE_META } from "@/lib/human-design";

interface HdChartListItem extends HdChartPayload {
  createdAt: string;
}

export default function HdCabinet() {
  const [charts, setCharts] = useState<HdChartListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const load = useCallback(() => {
    fetch("/api/human-design/mine")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setEnabled(d.enabled !== false);
        const list = Array.isArray(d.charts) ? (d.charts as HdChartListItem[]) : [];
        setCharts(list);
        if (list[0] && !selectedId) setSelectedId(list[0].id);
      })
      .catch(() => setCharts([]));
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled) {
    return (
      <p className="text-sm text-white/50">Модуль Дизайна Человека временно недоступен.</p>
    );
  }

  if (charts === null) {
    return <p className="text-sm text-white/50">Загружаем карты…</p>;
  }

  if (creating || charts.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Дизайн Человека</h1>
          {charts.length > 0 && (
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="hd-bodygraph__export"
            >
              Мои карты
            </button>
          )}
        </div>
        <HdCalculator returnTo="/cabinet/human-design" />
      </div>
    );
  }

  const selected = charts.find((c) => c.id === selectedId) ?? charts[0]!;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Дизайн Человека</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="hd-bodygraph__export"
        >
          Новая карта
        </button>
      </div>

      {charts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {charts.map((c) => {
            const active = c.id === selected.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`rounded-full border px-3.5 py-1.5 text-xs transition ${
                  active
                    ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                    : "border-white/10 bg-white/[0.03] text-white/60 hover:border-amber-500/30"
                }`}
              >
                {c.placeName} · {c.birthDate.split("-").reverse().join(".")}
                <span className="ml-1.5 text-white/40">{TYPE_META[c.chart.type].nameRu}</span>
              </button>
            );
          })}
        </div>
      )}

      <HdChartView payload={selected} />
      <HdReportPanel
        chartId={selected.id}
        authenticated
        loginReturnTo="/cabinet/human-design"
      />
    </div>
  );
}
