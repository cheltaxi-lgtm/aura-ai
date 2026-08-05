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

  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    fetch("/api/human-design/mine")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (seq !== loadSeq.current) return;
        setLoadError(false);
        setEnabled(d.enabled !== false);
        const list = Array.isArray(d.charts) ? (d.charts as HdChartListItem[]) : [];
        list.sort((a, b) => {
          const aSelf = isOther(a) ? 1 : 0;
          const bSelf = isOther(b) ? 1 : 0;
          return aSelf - bSelf;
        });
        setCharts(list);
        if (list.length && !selectedIdRef.current) {
          const selfChart = list.find((c) => !isOther(c));
          setSelectedId((selfChart ?? list[0]).id);
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
              onClick={() => setCreating(false)}
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
              // Чужой расчёт не должен открываться вместо «моей» карты.
              selectedIdRef.current = null;
              setSelectedId(null);
            } else {
              setSelectedId(chart.id);
            }
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

  const selfCharts = charts.filter((c) => !isOther(c));
  const otherCharts = charts.filter((c) => isOther(c));
  const selected = charts.find((c) => c.id === selectedId) ?? selfCharts[0] ?? charts[0]!;
  const selectedIsOther = isOther(selected);

  const deleteSelected = async () => {
    const who = hdChartChipLabel(selected);
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
        `/api/human-design/chart?id=${encodeURIComponent(selected.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error("delete failed");
      const remaining = charts.filter((c) => c.id !== selected.id);
      setCharts(remaining);
      const nextSelf = remaining.find((c) => !isOther(c));
      setSelectedId((nextSelf ?? remaining[0])?.id ?? null);
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">
          {selectedIsOther ? "Карта другого человека" : "Моя карта"}
        </h1>
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

      {selfCharts.length > 0 && (
        <div className="space-y-2">
          {selfCharts.length > 1 || otherCharts.length > 0 ? (
            <p className="text-[0.6875rem] uppercase tracking-wider text-amber-100/45">
              Моя карта
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {selfCharts.map((c) => chipBtn(c, c.id === selected.id))}
          </div>
        </div>
      )}

      {otherCharts.length > 0 && (
        <div className="space-y-2 border-t border-white/10 pt-4">
          <p className="text-[0.6875rem] uppercase tracking-wider text-white/40">
            Карты других людей
          </p>
          <p className="text-xs text-white/40">
            Сохранены из расчётов «другому человеку» — это не ваша карта.
          </p>
          <div className="flex flex-wrap gap-2">
            {otherCharts.map((c) => chipBtn(c, c.id === selected.id))}
          </div>
          {selectedIsOther && selfCharts[0] && (
            <button
              type="button"
              onClick={() => setSelectedId(selfCharts[0]!.id)}
              className="hd-bodygraph__export"
            >
              Вернуться к моей карте
            </button>
          )}
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
                  {hdChartChipLabel(c)}
                </button>
              ))}
          </div>
          {partnerId && (() => {
            const partner = charts.find((c) => c.id === partnerId);
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
