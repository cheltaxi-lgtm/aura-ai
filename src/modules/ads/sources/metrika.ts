/**
 * Read-only Metrika traffic + goals for Ads Sources dashboard.
 */
import { metrikaCounterId, metrikaToken } from "./env";

export type MetrikaGoalRow = {
  id: number;
  name: string;
  type?: string;
};

export type MetrikaMappedGoal = {
  env: string;
  label: string;
  id: number | null;
  name: string | null;
  reaches7d: number | null;
  reaches30d: number | null;
  cr7d: number | null;
};

export type MetrikaSnapshot = {
  counterId: string | null;
  range7d: { from: string; to: string };
  range30d: { from: string; to: string };
  goals: MetrikaGoalRow[];
  mappedGoals: MetrikaMappedGoal[];
  traffic7d: {
    visits: number;
    users: number;
    pageviews: number;
    bounceRate: number | null;
    avgDurationSec: number | null;
  } | null;
  traffic30d: {
    visits: number;
    users: number;
    pageviews: number;
    bounceRate: number | null;
    avgDurationSec: number | null;
  } | null;
  daily: { date: string; visits: number; users: number }[];
  bySource: { source: string; visits: number; users: number; bounceRate: number | null }[];
  byDevice: { device: string; visits: number; users: number }[];
  topLandings: { path: string; visits: number; bounceRate: number | null }[];
  topSearchPhrases: { phrase: string; visits: number }[];
  offlineUploadingsOk: boolean | null;
};

const MAPPED = [
  { env: "ADS_GOAL_REGISTRATION", label: "Регистрация" },
  { env: "ADS_GOAL_FIRST_PAYMENT", label: "Первая оплата" },
  { env: "ADS_GOAL_FIRST_RUNE_SPEND", label: "Первый расход рун" },
  { env: "ADS_GOAL_CLAIM", label: "Claim гостя" },
  { env: "ADS_GOAL_GUEST_SPREAD_START", label: "Старт гостевого расклада" },
] as const;

function oauthHeaders() {
  const token = metrikaToken();
  if (!token) return null;
  return { Authorization: `OAuth ${token}` };
}

function dayOffset(offset: number): string {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
}

async function metrikaJson(
  pathAndQuery: string
): Promise<Record<string, unknown> | null> {
  const headers = oauthHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(`https://api-metrika.yandex.net${pathAndQuery}`, {
      headers,
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function trafficTotals(
  counter: string,
  date1: string,
  date2: string
): Promise<MetrikaSnapshot["traffic7d"]> {
  const json = await metrikaJson(
    `/stat/v1/data?ids=${counter}` +
      `&metrics=ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgVisitDurationSeconds` +
      `&date1=${date1}&date2=${date2}&accuracy=full`
  );
  if (!json) return null;
  const totals = (json.totals as unknown[]) || [];
  return {
    visits: num(totals[0]),
    users: num(totals[1]),
    pageviews: num(totals[2]),
    bounceRate: pct(totals[3]),
    avgDurationSec: pct(totals[4]),
  };
}

async function goalReaches(
  counter: string,
  goalId: number,
  date1: string,
  date2: string
): Promise<number | null> {
  const json = await metrikaJson(
    `/stat/v1/data?ids=${counter}` +
      `&metrics=ym:s:goal${goalId}reaches` +
      `&date1=${date1}&date2=${date2}&accuracy=full`
  );
  if (!json) return null;
  return num((json.totals as unknown[])?.[0]);
}

async function dailySeries(
  counter: string,
  date1: string,
  date2: string
): Promise<MetrikaSnapshot["daily"]> {
  const json = await metrikaJson(
    `/stat/v1/data?ids=${counter}` +
      `&metrics=ym:s:visits,ym:s:users` +
      `&dimensions=ym:s:date` +
      `&date1=${date1}&date2=${date2}&sort=ym:s:date&limit=40&accuracy=full`
  );
  if (!json) return [];
  const rows = (json.data as { dimensions?: { name?: string }[]; metrics?: unknown[] }[]) || [];
  return rows.map((r) => ({
    date: r.dimensions?.[0]?.name || "",
    visits: num(r.metrics?.[0]),
    users: num(r.metrics?.[1]),
  })).filter((r) => r.date);
}

async function byDim(
  counter: string,
  date1: string,
  date2: string,
  dimension: string,
  limit: number
): Promise<{ name: string; visits: number; users: number; bounceRate: number | null }[]> {
  const json = await metrikaJson(
    `/stat/v1/data?ids=${counter}` +
      `&metrics=ym:s:visits,ym:s:users,ym:s:bounceRate` +
      `&dimensions=${encodeURIComponent(dimension)}` +
      `&date1=${date1}&date2=${date2}&sort=-ym:s:visits&limit=${limit}&accuracy=full`
  );
  if (!json) return [];
  const rows = (json.data as { dimensions?: { name?: string }[]; metrics?: unknown[] }[]) || [];
  return rows
    .map((r) => ({
      name: r.dimensions?.[0]?.name || "(не задано)",
      visits: num(r.metrics?.[0]),
      users: num(r.metrics?.[1]),
      bounceRate: pct(r.metrics?.[2]),
    }))
    .filter((r) => r.visits > 0);
}

async function topPhrases(
  counter: string,
  date1: string,
  date2: string
): Promise<MetrikaSnapshot["topSearchPhrases"]> {
  const json = await metrikaJson(
    `/stat/v1/data?ids=${counter}` +
      `&metrics=ym:s:visits` +
      `&dimensions=ym:s:lastSearchPhrase` +
      `&date1=${date1}&date2=${date2}&sort=-ym:s:visits&limit=25&accuracy=full`
  );
  if (!json) return [];
  const rows = (json.data as { dimensions?: { name?: string }[]; metrics?: unknown[] }[]) || [];
  return rows
    .map((r) => ({
      phrase: r.dimensions?.[0]?.name || "",
      visits: num(r.metrics?.[0]),
    }))
    .filter((r) => r.phrase && r.phrase !== "(not set)" && r.visits > 0);
}

export async function fetchMetrikaSnapshot(): Promise<MetrikaSnapshot> {
  const counterId = metrikaCounterId();
  const headers = oauthHeaders();
  if (!counterId || !headers) {
    const missing = [
      !counterId ? "METRIKA_COUNTER_ID|YANDEX_METRIKA_COUNTER_ID" : null,
      !headers ? "METRIKA_TOKEN|YANDEX_METRIKA_OAUTH_TOKEN" : null,
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`Metrika credentials missing: ${missing}`);
  }

  const d0 = dayOffset(0);
  const d7 = dayOffset(-6);
  const d14 = dayOffset(-13);
  const d30 = dayOffset(-29);
  const range7d = { from: d7, to: d0 };
  const range30d = { from: d30, to: d0 };

  let goals: MetrikaGoalRow[] = [];
  try {
    const res = await fetch(
      `https://api-metrika.yandex.net/management/v1/counter/${counterId}/goals`,
      { headers }
    );
    if (res.ok) {
      const json = (await res.json()) as { goals?: { id: number; name: string; type?: string }[] };
      goals = (json.goals || []).map((g) => ({ id: g.id, name: g.name, type: g.type }));
    }
  } catch {
    /* degrade */
  }

  const traffic7d = await trafficTotals(counterId, d7, d0);
  const traffic30d = await trafficTotals(counterId, d30, d0);
  const daily = await dailySeries(counterId, d14, d0);
  const sources = await byDim(counterId, d7, d0, "ym:s:lastTrafficSource", 12);
  const devices = await byDim(counterId, d7, d0, "ym:s:deviceCategory", 8);
  const landings = await byDim(counterId, d7, d0, "ym:s:startURLPath", 20);
  const phrases = await topPhrases(counterId, d30, d0);

  const byId = new Map(goals.map((g) => [g.id, g.name]));
  const mappedGoals: MetrikaMappedGoal[] = [];
  for (const m of MAPPED) {
    const id = Number(process.env[m.env]) || null;
    const reaches7d = id ? await goalReaches(counterId, id, d7, d0) : null;
    const reaches30d = id ? await goalReaches(counterId, id, d30, d0) : null;
    const visits7 = traffic7d?.visits || 0;
    mappedGoals.push({
      env: m.env,
      label: m.label,
      id,
      name: id ? byId.get(id) || m.label : null,
      reaches7d,
      reaches30d,
      cr7d:
        reaches7d != null && visits7 > 0 ? reaches7d / visits7 : null,
    });
  }

  let offlineUploadingsOk: boolean | null = null;
  try {
    const res = await fetch(
      `https://api-metrika.yandex.net/management/v1/counter/${counterId}/offline_conversions/uploadings`,
      { headers }
    );
    offlineUploadingsOk = res.ok;
  } catch {
    offlineUploadingsOk = false;
  }

  return {
    counterId,
    range7d,
    range30d,
    goals: goals.slice(0, 100),
    mappedGoals,
    traffic7d,
    traffic30d,
    daily,
    bySource: sources.map((s) => ({
      source: s.name,
      visits: s.visits,
      users: s.users,
      bounceRate: s.bounceRate,
    })),
    byDevice: devices.map((d) => ({
      device: d.name,
      visits: d.visits,
      users: d.users,
    })),
    topLandings: landings.map((l) => ({
      path: l.name,
      visits: l.visits,
      bounceRate: l.bounceRate,
    })),
    topSearchPhrases: phrases,
    offlineUploadingsOk,
  };
}

export async function persistMetrikaGoalStats(
  snapshot: MetrikaSnapshot
): Promise<void> {
  const { adsQuery } = await import("../db");
  const date = new Date().toISOString().slice(0, 10);
  for (const g of snapshot.mappedGoals) {
    if (g.id == null || g.reaches7d == null) continue;
    await adsQuery(
      `INSERT INTO ads.metrika_goal_stat (date, goal_id, goal_name, reaches)
       VALUES ($1::date, $2, $3, $4)
       ON CONFLICT (date, goal_id) DO UPDATE SET
         goal_name = EXCLUDED.goal_name,
         reaches = EXCLUDED.reaches`,
      [date, g.id, g.name || g.label, g.reaches7d]
    );
  }
}
