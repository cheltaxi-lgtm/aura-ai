"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HdCalculator from "./HdCalculator";
import HdChartView, { type HdChartPayload } from "./HdChartView";
import HdComposite from "./HdComposite";
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
  const [deleting, setDeleting] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  // Read the current selection inside load() without depending on it —
  // otherwise every chip click recreates load and refetches the whole list.
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  // Monotonic load counter: a slow response must not clobber newer state
  // (e.g. resurrect a just-deleted chart).
  const loadSeq = useRef(0);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    fetch("/api/human-design/mine")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (seq !== loadSeq.current) return;
        setLoadError(false);
        setEnabled(d.enabled !== false);
        const list = Array.isArray(d.charts) ? (d.charts as HdChartListItem[]) : [];
        setCharts(list);
        if (list.length && !selectedIdRef.current) {
          // Prefer personal chart over the newest “other” so a partner
          // calculation doesn’t steal the default focus.
          const selfChart = list.find((c) => c.subjectKind !== "other");
          setSelectedId((selfChart ?? list[0]).id);
        }
      })
      .catch(() => {
        if (seq !== loadSeq.current) return;
        // Keep the previous list (if any) — an empty list would flash the
        // "create your first chart" form over a transient network error.
        setLoadError(true);
        setCharts((prev) => prev ?? []);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A stale partner id must not survive switching/deleting the base chart.
  useEffect(() => {
    setPartnerId(null);
  }, [selectedId]);

  // Refetch when the tab becomes visible — a chart computed in another tab
  // (public calculator) must appear without a manual reload.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  if (!enabled) {
    return (
      <p className="text-sm text-white/50">Модуль Дизайна Человека временно недоступен.</p>
    );
  }

  if (charts === null) {
    return <p className="text-sm text-white/50">Загружаем карты…</p>;
  }

  if (loadError && charts.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-300/80">Не удалось загрузить карты. Проверьте соединение.</p>
        <button type="button" onClick={load} className="hd-bodygraph__export">
          Повторить
        </button>
      </div>
    );
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
        <HdCalculator
          returnTo="/cabinet/human-design"
          onChartCreated={(chart) => {
            setCreating(false);
            setSelectedId(chart.id);
            setCharts(null);
            load();
          }}
          onChartDeleted={(chartId) => {
            if (chartId === selectedId) setSelectedId(null);
            load();
          }}
        />
      </div>
    );
  }

  const selected = charts.find((c) => c.id === selectedId) ?? charts[0]!;

  const deleteSelected = async () => {
    const who =
      selected.subjectKind === "other" && selected.subjectName
        ? `«${selected.subjectName}»`
        : "эту карту";
    if (
      !window.confirm(
        `Удалить карту ${who} безвозвратно? Пропадут бодиграф, разбор Эвелины и переписка по нему — из кабинета, истории и памяти мастеров.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/human-design/chart?id=${encodeURIComponent(selected.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error("delete failed");
      const remaining = charts.filter((c) => c.id !== selected.id);
      setCharts(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      if (remaining.length === 0) setCreating(true);
    } catch {
      window.alert("Не удалось удалить карту. Попробуйте ещё раз.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Дизайн Человека</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void deleteSelected()}
            disabled={deleting}
            className="hd-bodygraph__export !border-red-400/30 !text-red-300/80 hover:!border-red-400/60 hover:!text-red-200 disabled:opacity-50"
          >
            {deleting ? "Удаление…" : "Удалить карту"}
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="hd-bodygraph__export"
          >
            Новая карта
          </button>
        </div>
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
                {c.subjectKind === "other" && c.subjectName
                  ? `${c.subjectName} · `
                  : ""}
                {c.birthDate.split("-").reverse().join(".")}
                <span className="ml-1.5 text-white/40">{TYPE_META[c.chart.type].nameRu}</span>
              </button>
            );
          })}
        </div>
      )}

      <HdChartView key={selected.id} payload={selected} />

      {charts.length > 1 && (
        <div className="hd-print-hidden space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/50">Композит с:</span>
            {charts
              .filter((c) => c.id !== selected.id)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPartnerId(partnerId === c.id ? null : c.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    partnerId === c.id
                      ? "border-violet-400/60 bg-violet-500/15 text-violet-100"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:border-violet-400/40"
                  }`}
                >
                  {c.subjectKind === "other" && c.subjectName
                    ? c.subjectName
                    : c.birthDate.split("-").reverse().join(".")}
                </button>
              ))}
          </div>
          {partnerId && (() => {
            const partner = charts.find((c) => c.id === partnerId);
            // The partner chip may disappear under us (deleted in another tab)
            // — render nothing instead of crashing on a stale id.
            return partner ? (
              <HdComposite
                key={`${selected.id}:${partnerId}`}
                base={selected}
                partner={partner}
              />
            ) : null;
          })()}
        </div>
      )}

      <HdReportPanel
        key={selected.id}
        chartId={selected.id}
        authenticated
        loginReturnTo="/cabinet/human-design"
      />
    </div>
  );
}
