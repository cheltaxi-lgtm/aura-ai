"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HdCalculator from "./HdCalculator";
import HdChartView, { type HdChartPayload } from "./HdChartView";
import HdComposite from "./HdComposite";
import HdReportPanel from "./HdReportPanel";
import { hdChartChipLabel } from "./hd-labels";
import { TYPE_META } from "@/lib/human-design";

interface HdChartListItem extends HdChartPayload {
  createdAt: string;
}

type HdFolder = "self" | "others";

function normalizeChart(raw: HdChartListItem): HdChartListItem {
  return {
    ...raw,
    subjectKind: raw.subjectKind === "other" ? "other" : "self",
    subjectName: raw.subjectKind === "other" ? raw.subjectName ?? null : null,
  };
}

export default function HdCabinet() {
  const [charts, setCharts] = useState<HdChartListItem[] | null>(null);
  const [folder, setFolder] = useState<HdFolder>("self");
  const [otherId, setOtherId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
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
        const list = (Array.isArray(d.charts) ? d.charts : []).map((c: HdChartListItem) =>
          normalizeChart(c)
        );
        setCharts(list);
        setOtherId((prev) => {
          const others = list.filter((c: HdChartListItem) => c.subjectKind === "other");
          if (prev && others.some((c: HdChartListItem) => c.id === prev)) return prev;
          return others[0]?.id ?? null;
        });
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
  }, [folder, otherId]);

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

  const selfChart = useMemo(
    () => charts?.find((c) => c.subjectKind !== "other") ?? null,
    [charts]
  );
  const otherCharts = useMemo(
    () => (charts ?? []).filter((c) => c.subjectKind === "other"),
    [charts]
  );
  const activeOther = useMemo(() => {
    if (!otherId) return otherCharts[0] ?? null;
    return otherCharts.find((c) => c.id === otherId) ?? otherCharts[0] ?? null;
  }, [otherCharts, otherId]);

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
                setFolder("self");
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
            const kind = chart.subjectKind === "other" ? "other" : "self";
            setCreating(false);
            setCharts(null);
            setFolder(kind === "other" ? "others" : "self");
            if (kind === "other") setOtherId(chart.id);
            load();
          }}
          onChartDeleted={() => {
            load();
          }}
        />
      </div>
    );
  }

  const deleteChart = async (target: HdChartListItem) => {
    const who = hdChartChipLabel(target);
    if (
      !window.confirm(
        `Удалить карту «${who}» безвозвратно? Пропадут бодиграф, разбор Эвелины и переписка по нему.`
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
      if (target.subjectKind === "other") {
        const nextOther = remaining.find((c) => c.subjectKind === "other");
        setOtherId(nextOther?.id ?? null);
        if (!nextOther) setFolder("self");
      }
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
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="hd-bodygraph__export"
        >
          Новая карта
        </button>
      </div>

      <div
        className="flex gap-1 rounded-2xl border border-white/10 p-1"
        role="tablist"
        aria-label="Папки карт"
      >
        <button
          type="button"
          role="tab"
          aria-selected={folder === "self"}
          onClick={() => setFolder("self")}
          className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            folder === "self"
              ? "bg-amber-500/20 text-amber-50"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Моя карта
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={folder === "others"}
          onClick={() => setFolder("others")}
          className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            folder === "others"
              ? "bg-amber-500/20 text-amber-50"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Другие{otherCharts.length > 0 ? ` · ${otherCharts.length}` : ""}
        </button>
      </div>

      {/* ─── SELF FOLDER: only personal chart. Composite lives only here. ─── */}
      {folder === "self" && (
        <div role="tabpanel" key="folder-self" className="space-y-5">
          {!selfChart ? (
            <div className="space-y-3 rounded-2xl border border-white/10 px-4 py-6 text-center">
              <p className="text-sm text-white/55">Личной карты ещё нет.</p>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="hd-bodygraph__export"
              >
                Рассчитать свою карту
              </button>
            </div>
          ) : (
            <>
              {/* key forces a full remount — prevents stacked bodygraphs on switch */}
              <div key={`self-pane-${selfChart.id}`} className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-amber-100/80">{hdChartChipLabel(selfChart)}</p>
                  <button
                    type="button"
                    onClick={() => void deleteChart(selfChart)}
                    disabled={deleting}
                    className="hd-bodygraph__export !border-red-400/30 !text-red-300/80 hover:!border-red-400/60 hover:!text-red-200 disabled:opacity-50"
                  >
                    {deleting ? "Удаление…" : "Удалить"}
                  </button>
                </div>
                <HdChartView payload={selfChart} />
                {otherCharts.length > 0 && (
                  <div className="hd-print-hidden space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-white/50">Композит с:</span>
                      {otherCharts.map((c) => (
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
                      const partner = otherCharts.find((c) => c.id === partnerId);
                      return partner ? (
                        <HdComposite
                          key={`${selfChart.id}:${partner.id}`}
                          base={selfChart}
                          partner={partner}
                        />
                      ) : null;
                    })()}
                  </div>
                )}
                <HdReportPanel
                  chartId={selfChart.id}
                  authenticated
                  loginReturnTo="/cabinet/human-design"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── OTHERS FOLDER: never mount self chart / self composite here. ─── */}
      {folder === "others" && (
        <div role="tabpanel" key="folder-others" className="space-y-5">
          {otherCharts.length === 0 || !activeOther ? (
            <div className="space-y-3 rounded-2xl border border-white/10 px-4 py-6 text-center">
              <p className="text-sm text-white/55">
                Здесь только карты других людей. Вашей карты здесь нет.
              </p>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="hd-bodygraph__export"
              >
                Рассчитать другому
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {otherCharts.map((c) => {
                  const active = c.id === activeOther.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setOtherId(c.id)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs transition ${
                        active
                          ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                          : "border-white/10 bg-white/[0.03] text-white/60 hover:border-amber-500/30"
                      }`}
                    >
                      {hdChartChipLabel(c)}
                      <span className="ml-1.5 text-white/40">
                        {TYPE_META[c.chart.type].nameRu}
                      </span>
                    </button>
                  );
                })}
              </div>
              {activeOther.subjectKind === "other" &&
                activeOther.id !== selfChart?.id && (
                  <div key={`other-pane-${activeOther.id}`} className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-white/55">{hdChartChipLabel(activeOther)}</p>
                      <button
                        type="button"
                        onClick={() => void deleteChart(activeOther)}
                        disabled={deleting}
                        className="hd-bodygraph__export !border-red-400/30 !text-red-300/80 hover:!border-red-400/60 hover:!text-red-200 disabled:opacity-50"
                      >
                        {deleting ? "Удаление…" : "Удалить"}
                      </button>
                    </div>
                    <HdChartView payload={activeOther} />
                    <HdReportPanel
                      chartId={activeOther.id}
                      authenticated
                      loginReturnTo="/cabinet/human-design"
                    />
                  </div>
                )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
