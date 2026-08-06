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
/** Let POST flip the row to pending before the first poll. */
const FIRST_POLL_DELAY_MS = 1200;
/** Hard cap on waiting: full multi-pass generation can take minutes, not hours. */
const MAX_WAIT_MS = 15 * 60 * 1000;
/** Consecutive network/poll failures before surfacing an error. */
const MAX_CONSECUTIVE_FAILURES = 6;

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
  const startedAtRef = useRef<number | null>(null);
  startedAtRef.current = startedAt;
  const seenPendingRef = useRef(false);
  /** Text at start of regenerate so poll ignores the previous done payload. */
  const baselineTextRef = useRef<string | null>(null);
  const failCountRef = useRef(0);
  const genIdRef = useRef(0);
  onDoneRef.current = opts.onDone;
  onErrorRef.current = opts.onError;

  const startWait = useCallback((opts?: { baselineText?: string | null }) => {
    genIdRef.current += 1;
    seenPendingRef.current = false;
    failCountRef.current = 0;
    baselineTextRef.current =
      typeof opts?.baselineText === "string" ? opts.baselineText.trim() : null;
    setWaiting(true);
    setStartedAt(Date.now());
  }, []);

  const stopWait = useCallback(() => {
    seenPendingRef.current = false;
    baselineTextRef.current = null;
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
    const genAtStart = genIdRef.current;

    const giveUp = (message: string) => {
      if (cancelled || genIdRef.current !== genAtStart) return;
      onErrorRef.current?.(message);
      seenPendingRef.current = false;
      baselineTextRef.current = null;
      setWaiting(false);
      setStartedAt(null);
    };

    const tick = async () => {
      if (cancelled || genIdRef.current !== genAtStart) return;
      if (Date.now() - (startedAtRef.current ?? Date.now()) > MAX_WAIT_MS) {
        giveUp(
          "Генерация заняла слишком много времени. Обновите страницу через пару минут — результат сохранится в кабинете."
        );
        return;
      }
      try {
        const res = await fetch(url, { credentials: "include" });
        if (cancelled || genIdRef.current !== genAtStart) return;
        if (!res.ok) {
          failCountRef.current += 1;
          if (failCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
            giveUp("Не удаётся проверить статус генерации. Обновите страницу — разбор сохранится в кабинете.");
          }
          return;
        }
        failCountRef.current = 0;
        const data = (await res.json().catch(() => ({}))) as {
          report?: HdWaitReport | null;
        };
        const r = data.report;
        if (!r) return;

        if (r.status === "pending") {
          seenPendingRef.current = true;
          return;
        }

        if (r.status === "done" && r.reportText) {
          const text =
            typeof r.reportText === "string" ? sanitizeHdReportText(r.reportText) : r.reportText;
          const trimmed = (text || "").trim();
          const baseline = baselineTextRef.current;
          // Ignore pre-generation done until we saw pending (or text actually changed).
          const isStaleBaseline =
            baseline !== null && trimmed === baseline && !seenPendingRef.current;
          if (isStaleBaseline) return;

          onDoneRef.current({ ...r, reportText: text });
          if (!cancelled && genIdRef.current === genAtStart) {
            seenPendingRef.current = false;
            baselineTextRef.current = null;
            setWaiting(false);
            setStartedAt(null);
          }
          return;
        }

        if (r.status === "error") {
          onErrorRef.current?.(
            "Генерация не завершилась. Если руны списались — они вернутся; нажмите ещё раз."
          );
          if (!cancelled && genIdRef.current === genAtStart) {
            seenPendingRef.current = false;
            baselineTextRef.current = null;
            setWaiting(false);
            setStartedAt(null);
          }
        }
      } catch {
        failCountRef.current += 1;
        if (failCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
          giveUp("Сеть нестабильна — не можем проверить статус. Обновите страницу через минуту.");
        }
      }
    };

    const first = window.setTimeout(() => void tick(), FIRST_POLL_DELAY_MS);
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [opts.enabled, pollUrl, waiting]);

  return { waiting, startedAt, startWait, stopWait, setWaiting, setStartedAt };
}
