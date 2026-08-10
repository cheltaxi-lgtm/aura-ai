"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ActiveReportItem = {
  jobId: string;
  kind: string;
  status: "pending" | "running" | "completed" | "failed" | "needs_regeneration";
  productTitle: string;
  etaRangeSec: { min: number; max: number } | null;
  destination: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  heartbeatAt: string;
  attempts: number;
  nextAttemptAt: string | null;
  billingState: string;
  refunded: boolean;
  queuePosition: number | null;
  progress?: {
    done?: number;
    total?: number;
    label?: string;
    stage?: string;
    message?: string;
  };
  notification: Record<string, string> | null;
};

const ACTIVE_POLL_MS = 10_000;
const IDLE_POLL_MS = 60_000;

/** Polls /api/jobs/reports — active heavy reports plus recently terminal. */
export function useActiveReports(enabled = true): {
  reports: ActiveReportItem[];
  active: ActiveReportItem[];
  loading: boolean;
} {
  const [reports, setReports] = useState<ActiveReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/jobs/reports", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { reports?: ActiveReportItem[] };
      const list = Array.isArray(data.reports) ? data.reports : [];
      setReports(list);
      return list.some((r) => r.status === "pending" || r.status === "running");
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;

    const schedule = (ms: number) => {
      if (stopped) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void tick(), ms);
    };
    const tick = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.hidden) {
        schedule(IDLE_POLL_MS);
        return;
      }
      const hasActive = await load();
      schedule(hasActive ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };

    void tick();
    return () => {
      stopped = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [enabled, load]);

  const active = reports.filter(
    (r) => r.status === "pending" || r.status === "running"
  );
  return { reports, active, loading };
}
