import { query } from "@/lib/db";
import { openRouterFetch } from "@/lib/openrouter-fetch";
import { isAsyncReportInProcessEnabled } from "@/lib/async-report-flags";

export const ASYNC_WORKER_HEALTH_KEY = "async_worker_health";

export type AsyncWorkerHealth = {
  ok: boolean;
  checkedAt: string;
  latencyMs: number | null;
  error: string | null;
  proxyConfigured: boolean;
  proxyUrlHost: string | null;
  inprocess: boolean;
  openRouterStatus: number | null;
  workerId?: string | null;
};

function proxyHost(): string | null {
  const raw = process.env.OPENROUTER_HTTPS_PROXY?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return raw;
  }
}

export async function probeOpenRouterFromWorker(workerId?: string): Promise<AsyncWorkerHealth> {
  const started = Date.now();
  const proxyConfigured = Boolean(process.env.OPENROUTER_HTTPS_PROXY?.trim());
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const base: AsyncWorkerHealth = {
    ok: false,
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    error: null,
    proxyConfigured,
    proxyUrlHost: proxyHost(),
    inprocess: isAsyncReportInProcessEnabled(),
    openRouterStatus: null,
    workerId: workerId ?? null,
  };

  if (!key) {
    return { ...base, error: "OPENROUTER_API_KEY missing in worker env" };
  }
  if (!proxyConfigured) {
    return {
      ...base,
      error:
        "OPENROUTER_HTTPS_PROXY missing in worker env — Beget cannot reach OpenRouter directly",
    };
  }

  try {
    const response = await openRouterFetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const latencyMs = Date.now() - started;
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        ...base,
        checkedAt: new Date().toISOString(),
        latencyMs,
        openRouterStatus: response.status,
        error: `OpenRouter HTTP ${response.status}: ${text.slice(0, 180)}`,
      };
    }
    return {
      ...base,
      ok: true,
      checkedAt: new Date().toISOString(),
      latencyMs,
      openRouterStatus: response.status,
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "OpenRouter probe failed",
    };
  }
}

export async function persistAsyncWorkerHealth(health: AsyncWorkerHealth): Promise<void> {
  await query(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = NOW()`,
    [ASYNC_WORKER_HEALTH_KEY, JSON.stringify(health)]
  );
}

export async function getAsyncWorkerHealth(): Promise<AsyncWorkerHealth | null> {
  const { rows } = await query<{ value: AsyncWorkerHealth }>(
    `SELECT value FROM platform_settings WHERE key = $1 LIMIT 1`,
    [ASYNC_WORKER_HEALTH_KEY]
  );
  const value = rows[0]?.value;
  if (!value || typeof value !== "object") return null;
  return value;
}
