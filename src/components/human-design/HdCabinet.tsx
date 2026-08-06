"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HdCalculator from "./HdCalculator";
import HdChartSlot from "./HdChartSlot";
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
  /** Composite replaces the main view — never stacks a second bodygraph under it. */
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

  const selfChart = useMemo(() => {
    const selfs = (charts ?? []).filter((c) => c.subjectKind !== "other");
    if (selfs.length <= 1) return selfs[0] ?? null;
    // Server heals to one self; if a race left extras, prefer the oldest.
    return [...selfs].sort((a, b) =>
      String(a.createdAt).localeCompare(String(b.createdAt))
    )[0]!;
  }, [charts]);
  const otherCharts = useMemo(
    () => (charts ?? []).filter((c) => c.subjectKind === "other"),
    [charts]
  );
  const activeOther = useMemo(() => {
    if (!otherId) return otherCharts[0] ?? null;
    return otherCharts.find((c) => c.id === otherId) ?? otherCharts[0] ?? null;
  }, [otherCharts, otherId]);

  const openFolder = (next: HdFolder) => {
    setPartnerId(null);
    setFolder(next);
  };

  const openOther = (id: string) => {
    setPartnerId(null);
    setOtherId(id);
  };

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
                openFolder("self");
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
            setPartnerId(null);
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
      setPartnerId(null);
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

  const partner =
    partnerId && selfChart
      ? otherCharts.find((c) => c.id === partnerId) ?? null
      : null;

  const slotKey =
    folder === "self"
      ? partner
        ? `composite:${selfChart?.id}:${partner.id}`
        : `self:${selfChart?.id ?? "none"}`
      : `other:${activeOther?.id ?? "none"}`;

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
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const next = folder === "self" ? "others" : "self";
            openFolder(next);
            requestAnimationFrame(() => {
              document.getElementById(next === "self" ? "hd-tab-self" : "hd-tab-others")?.focus();
            });
          }
        }}
      >
        <button
          type="button"
          id="hd-tab-self"
          role="tab"
          aria-selected={folder === "self"}
          aria-controls="hd-tab-panel"
          tabIndex={folder === "self" ? 0 : -1}
          onClick={() => openFolder("self")}
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
          id="hd-tab-others"
          role="tab"
          aria-selected={folder === "others"}
          aria-controls="hd-tab-panel"
          tabIndex={folder === "others" ? 0 : -1}
          onClick={() => openFolder("others")}
          className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
            folder === "others"
              ? "bg-amber-500/20 text-amber-50"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Другие{otherCharts.length > 0 ? ` · ${otherCharts.length}` : ""}
        </button>
      </div>

      {folder === "self" && selfChart && otherCharts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/50">Показать:</span>
          <button
            type="button"
            onClick={() => setPartnerId(null)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              !partnerId
                ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                : "border-white/10 bg-white/[0.03] text-white/60 hover:border-amber-500/30"
            }`}
          >
            Только моя
          </button>
          {otherCharts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setPartnerId(c.id)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                partnerId === c.id
                  ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:border-amber-500/30"
              }`}
            >
              Композит с {hdChartChipLabel(c)}
            </button>
          ))}
        </div>
      )}

      {folder === "others" && otherCharts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {otherCharts.map((c) => {
            const active = c.id === activeOther?.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => openOther(c.id)}
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
      )}

      {/* Exactly one chart surface — never two bodygraphs at once. */}
      <div
        id="hd-tab-panel"
        role="tabpanel"
        aria-labelledby={folder === "self" ? "hd-tab-self" : "hd-tab-others"}
      >
      <HdChartSlot slotKey={slotKey}>
        {folder === "self" && selfChart && !partner && (
          <div className="space-y-5">
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
            <HdReportPanel
              chartId={selfChart.id}
              authenticated
              loginReturnTo="/cabinet/human-design"
            />
          </div>
        )}

        {folder === "self" && selfChart && partner && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-amber-100/80">
                Композит: {hdChartChipLabel(selfChart)} + {hdChartChipLabel(partner)}
              </p>
              <button
                type="button"
                onClick={() => setPartnerId(null)}
                className="hd-bodygraph__export"
              >
                Закрыть композит
              </button>
            </div>
            <HdComposite base={selfChart} partner={partner} />
          </div>
        )}

        {folder === "self" && !selfChart && (
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
        )}

        {folder === "others" && activeOther && activeOther.subjectKind === "other" && (
          <div className="space-y-5">
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

        {folder === "others" && !activeOther && (
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
        )}
      </HdChartSlot>
      </div>
    </div>
  );
}
