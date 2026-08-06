"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeHdReportText } from "@/lib/human-design";

export type HdWaitReport = {
  id: string;
  status: "pending" | "done" | "error";
  reportText: string | null;
  packageId?: "depth" | "max";
  includedAsksRemaining?: number;
  reportTone?: "personal" | "child" | "work";
};

const POLL_MS = 3500;

type PollMode = "personal" | "composite";

/**
 * Poll HD report endpoints while generation runs (or after refresh on pending).
 * Personal: GET ?chartId=  Composite: GET ?baseChartId=&partnerChartId=
 */
export function useHdReportWait(opts: {
  mode: PollMode;
  enabled: boolean;
  chartId?: string;
  baseChartId?: string;
  partnerChartId?: string;
  onDone: (report: HdWaitReport) => void;
  onError?: (message: string) => void;
}) {
  const [waiting, setWaiting] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const onDoneRef = useRef(opts.onDone);
  const onErrorRef = useRef(opts.onError);
  onDoneRef.current = opts.onDone;
  onErrorRef.current = opts.onError;

  const startWait = useCallback(() => {
    setWaiting(true);
    setStartedAt((prev) => prev ?? Date.now());
  }, []);

  const stopWait = useCallback(() => {
    setWaiting(false);
    setStartedAt(null);
  }, []);

  const pollUrl = useCallback(() => {
    if (opts.mode === "personal" && opts.chartId) {
      return `/api/human-design/report?chartId=${encodeURIComponent(opts.chartId)}`;
    }
    if (opts.mode === "composite" && opts.baseChartId && opts.partnerChartId) {
      const qs = new URLSearchParams({
        baseChartId: opts.baseChartId,
        partnerChartId: opts.partnerChartId,
      });
      return `/api/human-design/composite-report?${qs}`;
    }
    return null;
  }, [opts.baseChartId, opts.chartId, opts.mode, opts.partnerChartId]);

  useEffect(() => {
    if (!opts.enabled || !waiting) return;
    const url = pollUrl();
    if (!url) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = (await res.json().catch(() => ({}))) as {
          report?: HdWaitReport | null;
        };
        const r = data.report;
        if (!r) return;
        if (r.status === "done" && r.reportText) {
          const text =
            typeof r.reportText === "string" ? sanitizeHdReportText(r.reportText) : r.reportText;
          onDoneRef.current({ ...r, reportText: text });
          if (!cancelled) {
            setWaiting(false);
            setStartedAt(null);
          }
          return;
        }
        if (r.status === "error") {
          onErrorRef.current?.(
            "Генерация не завершилась. Если руны списались — они вернутся; нажмите ещё раз."
          );
          if (!cancelled) {
            setWaiting(false);
            setStartedAt(null);
          }
        }
      } catch {
        /* keep polling */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [opts.enabled, pollUrl, waiting]);

  return { waiting, startedAt, startWait, stopWait, setWaiting, setStartedAt };
}
