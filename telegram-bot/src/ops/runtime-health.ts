import { getDb } from "../db/client.js";
import { botConfig } from "../config.js";
import { siteBridgeFetch } from "../domain/telegram-ipv4.js";

export type RuntimeHealthState = {
  mode: "polling" | "webhook";
  phase: "starting" | "running" | "draining" | "failed";
  lastTransportSuccessAt?: number;
  lastTransportErrorAt?: number;
  lastSiteBridgeSuccessAt?: number;
  lastSiteBridgeErrorAt?: number;
};
let state: RuntimeHealthState = { mode: "polling", phase: "starting" };

/** Polling/index updates this state; transport success includes empty fetches. */
export function setRuntimeHealth(update: Partial<RuntimeHealthState>): void {
  state = { ...state, ...update };
}

export async function probeSiteBridgeHealth(fetcher: typeof fetch = siteBridgeFetch as typeof fetch, signal?: AbortSignal): Promise<void> {
  try {
    if (!botConfig.siteInternalBaseUrl) throw new Error("bridge_not_configured");
    const response = await fetcher(`${botConfig.siteInternalBaseUrl}/api/health`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
      headers: { "user-agent": "zovus-bot-readiness" },
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error("bridge_unhealthy");
    setRuntimeHealth({ lastSiteBridgeSuccessAt: Date.now() });
  } catch { setRuntimeHealth({ lastSiteBridgeErrorAt: Date.now() }); }
}

/** Cache a cheap local site-health probe; never make readiness HTTP wait on it. */
export function startSiteBridgeHealthProbe(): () => void {
  const stopped = new AbortController();
  let pending = false;
  const tick = async () => {
    if (pending || stopped.signal.aborted) return;
    pending = true;
    try { await probeSiteBridgeHealth(undefined, stopped.signal); } finally { pending = false; }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, 30_000);
  timer.unref();
  return () => { clearInterval(timer); stopped.abort(); };
}

export function runtimeHealth() {
  const now = Date.now();
  let database: "ok" | "error" = "ok";
  let queued = 0;
  let needsReview = 0;
  let oldestQueuedAgeMs = 0;
  try {
    const db = getDb();
    db.prepare("SELECT update_id, status, owner_id FROM bot_processed_updates LIMIT 1").get();
    db.prepare("SELECT telegram_user_id FROM bot_reminder_delivery LIMIT 1").get();
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'bot_update_inbox'").get();
    if (exists) {
      const rows = db.prepare(`SELECT status, COUNT(*) AS n, MIN(received_at) AS oldest
        FROM bot_update_inbox GROUP BY status`).all() as { status: string; n: number; oldest: string }[];
      for (const row of rows) {
        if (row.status === "queued") {
          queued = row.n;
          oldestQueuedAgeMs = Math.max(0, now - Date.parse(row.oldest));
        } else if (row.status === "needs_review") needsReview = row.n;
      }
    } else if (state.mode === "polling" && state.phase === "running") database = "error";
  } catch { database = "error"; }
  const transportFresh = state.mode === "webhook" ||
    (state.lastTransportSuccessAt !== undefined && now - state.lastTransportSuccessAt <= 60_000);
  const siteBridgeFresh = !botConfig.requireSiteAccount ||
    (state.lastSiteBridgeSuccessAt !== undefined && now - state.lastSiteBridgeSuccessAt <= 90_000);
  const ready = state.phase === "running" && database === "ok" && transportFresh && siteBridgeFresh && oldestQueuedAgeMs < 15 * 60_000;
  return {
    ok: ready, service: "zovus-telegram-bot", phase: state.phase, mode: state.mode,
    db: database, transportFresh, siteBridgeFresh, queue: { queued, needsReview, oldestQueuedAgeMs },
    lastTransportSuccessAt: state.lastTransportSuccessAt ?? null,
    ts: new Date(now).toISOString(),
  };
}
