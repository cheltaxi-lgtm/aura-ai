"use client";

import { useCallback, useEffect, useRef } from "react";
import { parseAcceptedAsyncReport, readStoredAsyncJobId, waitForAsyncJob, type AcceptedAsyncReport } from "@/lib/client/wait-for-async-job";

/** A queued report may not have a receipt yet. Restore its durable job rather
 * than relying only on entity polling, which cannot see that queue interval. */
export function useHdAsyncDelivery(opts: {
  storageKey: string;
  enabled: boolean;
  onWaiting: (startedAt: number | null) => void;
  onAccepted: (accepted: AcceptedAsyncReport | null) => void;
  onDone: (result: Record<string, unknown>) => void;
  onError: (message: string, terminal: boolean) => void;
}) {
  const callbacks = useRef(opts);
  callbacks.current = opts;
  const current = useRef<{ id: string; controller: AbortController } | null>(null);

  const watch = useCallback((data: unknown) => {
    if (!data || typeof data !== "object") return;
    const id = (data as { jobId?: unknown }).jobId;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return;
    if (current.current?.id === id && !current.current.controller.signal.aborted) return;
    current.current?.controller.abort();
    const controller = new AbortController();
    current.current = { id, controller };
    const accepted = parseAcceptedAsyncReport(data);
    let startedAt: number | null = null;
    try {
      if (accepted) localStorage.setItem(`${opts.storageKey}:accepted`, JSON.stringify(accepted));
      const ts = Number(localStorage.getItem(`${opts.storageKey}-started`));
      if (Number.isFinite(ts) && ts > 0) startedAt = ts;
    } catch { /* Storage is optional. */ }
    callbacks.current.onWaiting(startedAt);
    callbacks.current.onAccepted(accepted);
    void waitForAsyncJob({ jobId: id, storageKey: opts.storageKey, signal: controller.signal,
      maxAgeMs: 60 * 60_000, maxAttempts: 1440, pollIntervalMs: 2500 }).then(result => {
      if (controller.signal.aborted || current.current?.id !== id) return;
      callbacks.current.onAccepted(null);
      callbacks.current.onDone(result);
    }).catch(error => {
      if (controller.signal.aborted || current.current?.id !== id) return;
      const terminal = readStoredAsyncJobId(opts.storageKey) !== id;
      if (terminal) callbacks.current.onAccepted(null);
      callbacks.current.onError(error instanceof Error ? error.message : "Не удалось проверить готовность отчёта.", terminal);
    }).finally(() => {
      if (controller.signal.aborted) return;
      if (readStoredAsyncJobId(opts.storageKey) !== id) {
        try { localStorage.removeItem(`${opts.storageKey}:accepted`); } catch { /* Optional. */ }
      }
      if (current.current?.id === id) current.current = null;
    });
  }, [opts.storageKey]);

  useEffect(() => {
    if (!opts.enabled) return;
    const id = readStoredAsyncJobId(opts.storageKey);
    if (id) {
      let accepted: unknown = null;
      try { accepted = JSON.parse(localStorage.getItem(`${opts.storageKey}:accepted`) ?? "null"); } catch { /* Optional. */ }
      watch({ ...(accepted && typeof accepted === "object" ? accepted : {}), jobId: id });
    }
    return () => { current.current?.controller.abort(); current.current = null; };
  }, [opts.enabled, opts.storageKey, watch]);

  return watch;
}
