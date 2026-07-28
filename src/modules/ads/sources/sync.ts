/**
 * Orchestrate read-only Yandex source sync → ads.source_snapshot (+ detail tables).
 */
import { adsQuery } from "../db";
import {
  isAdsEnabled,
  isAdsObserve,
  isAdsRulesEnabled,
  isAdsAutopilotWrite,
  rulesMode,
  getBudget,
} from "../config";
import { fetchDirectSnapshot, type DirectSnapshot } from "./direct";
import { fetchMetrikaSnapshot, persistMetrikaGoalStats, type MetrikaSnapshot } from "./metrika";
import {
  fetchWebmasterSnapshot,
  persistWebmasterQueries,
  type WebmasterSnapshot,
} from "./webmaster";
import { adsSourceTokenFlags } from "./env";

export type SourceName = "direct" | "metrika" | "webmaster" | "health";

async function saveSnapshot(
  source: SourceName,
  ok: boolean,
  payload: unknown,
  error?: string | null
) {
  await adsQuery(
    `INSERT INTO ads.source_snapshot (source, fetched_at, ok, error, payload_json)
     VALUES ($1, NOW(), $2, $3, $4::jsonb)
     ON CONFLICT (source) DO UPDATE SET
       fetched_at = NOW(),
       ok = EXCLUDED.ok,
       error = EXCLUDED.error,
       payload_json = EXCLUDED.payload_json`,
    [source, ok, error ?? null, JSON.stringify(payload ?? {})]
  );
}

export async function syncDirectSource(): Promise<{ ok: boolean; error?: string }> {
  try {
    const payload = await fetchDirectSnapshot();
    await saveSnapshot("direct", true, payload, null);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await saveSnapshot("direct", false, {}, error);
    return { ok: false, error };
  }
}

export async function syncMetrikaSource(): Promise<{ ok: boolean; error?: string }> {
  try {
    const payload = await fetchMetrikaSnapshot();
    await persistMetrikaGoalStats(payload);
    await saveSnapshot("metrika", true, payload, null);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await saveSnapshot("metrika", false, {}, error);
    return { ok: false, error };
  }
}

export async function syncWebmasterSource(): Promise<{ ok: boolean; error?: string }> {
  try {
    const payload = await fetchWebmasterSnapshot();
    await persistWebmasterQueries(payload);
    await saveSnapshot("webmaster", true, payload, null);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await saveSnapshot("webmaster", false, {}, error);
    return { ok: false, error };
  }
}

export async function syncHealthSource(partial?: {
  direct?: DirectSnapshot | null;
  metrika?: MetrikaSnapshot | null;
  webmaster?: WebmasterSnapshot | null;
}): Promise<void> {
  const budget = await getBudget();
  const tokens = adsSourceTokenFlags();
  const payload = {
    flags: {
      enabled: await isAdsEnabled(),
      observe: await isAdsObserve(),
      rulesEnabled: await isAdsRulesEnabled(),
      autopilotWrite: await isAdsAutopilotWrite(),
      rulesMode: rulesMode(),
    },
    budget: {
      mode: budget.mode,
      discovery_daily_cap_rub: budget.discovery_daily_cap_rub,
      global_daily_cap_rub: budget.global_daily_cap_rub,
      discovery_target_registrations: budget.discovery_target_registrations,
    },
    tokens,
    directBalanceRub: partial?.direct?.balanceRub ?? null,
    metrikaVisits7d: partial?.metrika?.traffic7d?.visits ?? null,
    webmasterQueries: partial?.webmaster?.queries?.length ?? null,
    moneyBlocker:
      partial?.direct?.balanceRub != null && partial.direct.balanceRub <= 0
        ? "direct_balance_zero"
        : partial?.direct?.balanceRub == null
          ? "direct_balance_unknown"
          : null,
  };
  await saveSnapshot("health", true, payload, null);
}

export async function syncAllSources(): Promise<{
  direct: { ok: boolean; error?: string };
  metrika: { ok: boolean; error?: string };
  webmaster: { ok: boolean; error?: string };
}> {
  const direct = await syncDirectSource();
  const metrika = await syncMetrikaSource();
  const webmaster = await syncWebmasterSource();

  let directPayload: DirectSnapshot | null = null;
  let metrikaPayload: MetrikaSnapshot | null = null;
  let webmasterPayload: WebmasterSnapshot | null = null;
  try {
    const { rows } = await adsQuery<{ source: string; payload_json: unknown }>(
      `SELECT source, payload_json FROM ads.source_snapshot
       WHERE source IN ('direct','metrika','webmaster')`
    );
    for (const r of rows) {
      if (r.source === "direct") directPayload = r.payload_json as DirectSnapshot;
      if (r.source === "metrika") metrikaPayload = r.payload_json as MetrikaSnapshot;
      if (r.source === "webmaster") webmasterPayload = r.payload_json as WebmasterSnapshot;
    }
  } catch {
    /* tables may not exist yet */
  }

  await syncHealthSource({
    direct: directPayload,
    metrika: metrikaPayload,
    webmaster: webmasterPayload,
  });

  return { direct, metrika, webmaster };
}

export async function loadSourceSnapshots() {
  const { rows } = await adsQuery<{
    source: string;
    fetched_at: Date;
    ok: boolean;
    error: string | null;
    payload_json: unknown;
  }>(`SELECT source, fetched_at, ok, error, payload_json FROM ads.source_snapshot`);
  const map: Record<
    string,
    { fetchedAt: string; ok: boolean; error: string | null; payload: unknown }
  > = {};
  for (const r of rows) {
    map[r.source] = {
      fetchedAt: new Date(r.fetched_at).toISOString(),
      ok: r.ok,
      error: r.error,
      payload: r.payload_json,
    };
  }
  return map;
}
