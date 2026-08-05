"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import HdCalculator from "./HdCalculator";
import HdChartView, { type HdChartPayload } from "./HdChartView";
import HdComposite from "./HdComposite";
import HdReportPanel from "./HdReportPanel";
import { hdChartChipLabel } from "./hd-labels";
import { TYPE_META } from "@/lib/human-design";

interface HdChartListItem extends HdChartPayload {
  createdAt: string;
}

function isOther(c: { subjectKind?: string | null }): boolean {
  return c.subjectKind === "other";
}

export default function HdCabinet() {
  const [charts, setCharts] = useState<HdChartListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  const loadSeq = useRef(0);
  const [loadError, setLoadError] = useState(false);
  /** First paint of this visit must land on self, not a leftover «other». */
  const initialSelectDone = useRef(false);

  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    fetch("/api/human-design/mine")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (seq !== loadSeq.current) return;
        setLoadError(false);
        setEnabled(d.enabled !== false);
        const list = Array.isArray(d.charts) ? (d.charts as HdChartListItem[]) : [];
        list.sort((a, b) => Number(isOther(a)) - Number(isOther(b)));
        setCharts(list);

        const selfChart = list.find((c) => !isOther(c));
        const current = selectedIdRef.current
          ? list.find((c) => c.id === selectedIdRef.current)
          : undefined;

        if (!initialSelectDone.current) {
          initialSelectDone.current = true;
          setSelectedId((selfChart ?? list[0])?.id ?? null);
          return;
        }

        if (!current) {
          setSelectedId((selfChart ?? list[0])?.id ?? null);
        }
      })
      .catch(() => {
        if (seq !== loadSeq.current) return;
        setLoadError(true);
        setCharts((prev) => prev ?? []);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPartnerId(null);
  }, [selectedId]);

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
              onClick={() => {
                initialSelectDone.current = false;
                setCreating(false);
              }}
              className="hd-bodygraph__export"
            >
              К моей карте
            </button>
          )}
        </div>
        <HdCalculator
          returnTo="/cabinet/human-design"
          onChartCreated={(chart) => {
            setCreating(false);
            setCharts(null);
            if (isOther(chart)) {
              // Re-run initial select → self.
              initialSelectDone.current = false;
              selectedIdRef.current = null;
              setSelectedId(null);
            } else {
              initialSelectDone.current = true;
              setSelectedId(chart.id);
            }
            load();
          }}
          onChartDeleted={(chartId) => {
            if (chartId === selectedId) {
              initialSelectDone.current = false;
              setSelectedId(null);
            }
            load();
          }}
        />
      </div>
    );
  }

  const selfCharts = charts.filter((c) => !isOther(c));
  const otherCharts = charts.filter((c) => isOther(c));
  const selected = charts.find((c) => c.id === selectedId) ?? selfCharts[0] ?? charts[0]!;
  const selectedIsOther = isOther(selected);
  const selfSelected = selfCharts.find((c) => c.id === selected.id) ?? null;
  const otherSelected = selectedIsOther ? selected : null;

  const deleteChart = async (target: HdChartListItem) => {
    const who = hdChartChipLabel(target);
    if (
      !window.confirm(
        `Удалить карту «${who}» безвозвратно? Пропадут бодиграф, разбор Эвелины и переписка по нему — из кабинета, истории и памяти мастеров.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/human-design/chart?id=${encodeURIComponent(target.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error("delete failed");
      const remaining = charts.filter((c) => c.id !== target.id);
      setCharts(remaining);
      if (selected.id === target.id) {
        const nextSelf = remaining.find((c) => !isOther(c));
        setSelectedId((nextSelf ?? remaining[0])?.id ?? null);
      }
      if (remaining.length === 0) setCreating(true);
    } catch {
      window.alert("Не удалось удалить карту. Попробуйте ещё раз.");
    } finally {
      setDeleting(false);
    }
  };

  const chipBtn = (c: HdChartListItem, active: boolean) => (
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
      {hdChartChipLabel(c)}
      <span className="ml-1.5 text-white/40">{TYPE_META[c.chart.type].nameRu}</span>
    </button>
  );

  const chartBlock = (payload: HdChartListItem) => (
    <div className="space-y-5" key={`block-${payload.id}`}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void deleteChart(payload)}
          disabled={deleting}
          className="hd-bodygraph__export !border-red-400/30 !text-red-300/80 hover:!border-red-400/60 hover:!text-red-200 disabled:opacity-50"
        >
          {deleting ? "Удаление…" : "Удалить карту"}
        </button>
      </div>
      <HdChartView key={payload.id} payload={payload} />
      {charts.length > 1 && payload.id === selected.id && (
        <div className="hd-print-hidden space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/50">Композит с:</span>
            {charts
              .filter((c) => c.id !== payload.id)
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
                  {hdChartChipLabel(c)}
                </button>
              ))}
          </div>
          {partnerId && (() => {
            const partner = charts.find((c) => c.id === partnerId);
            return partner ? (
              <HdComposite
                key={`${payload.id}:${partnerId}`}
                base={payload}
                partner={partner}
              />
            ) : null;
          })()}
        </div>
      )}
      <HdReportPanel
        key={`report-${payload.id}`}
        chartId={payload.id}
        authenticated
        loginReturnTo="/cabinet/human-design"
      />
    </div>
  );

  return (
    <div className="space-y-8">
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

      {/* Personal chart — bodygraph lives HERE, never under «others». */}
      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-[0.6875rem] uppercase tracking-wider text-amber-100/55">
            Моя карта
          </p>
          {selfCharts.length === 0 && (
            <p className="text-sm text-white/50">
              Личной карты ещё нет — нажмите «Новая карта» и рассчитайте для себя.
            </p>
          )}
          {selfCharts.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {selfCharts.map((c) => chipBtn(c, c.id === selected.id))}
            </div>
          )}
        </div>
        {selfSelected
          ? chartBlock(selfSelected)
          : selfCharts[0] && !selectedIsOther
            ? chartBlock(selfCharts[0])
            : selfCharts[0] && (
                <button
                  type="button"
                  onClick={() => setSelectedId(selfCharts[0]!.id)}
                  className="hd-bodygraph__export"
                >
                  Открыть мою карту · {hdChartChipLabel(selfCharts[0])}
                </button>
              )}
      </section>

      {otherCharts.length > 0 && (
        <section className="space-y-3 border-t border-white/10 pt-6">
          <div className="space-y-1">
            <p className="text-[0.6875rem] uppercase tracking-wider text-white/40">
              Карты других людей
            </p>
            <p className="text-xs text-white/40">
              Сохранены из расчёта «другому человеку». Не путать с вашей картой.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {otherCharts.map((c) => chipBtn(c, c.id === selected.id))}
          </div>
          {otherSelected ? (
            chartBlock(otherSelected)
          ) : (
            <p className="text-xs text-white/35">
              Выберите человека выше, чтобы открыть его бодиграф.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
