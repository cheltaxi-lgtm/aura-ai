/**
 * Read-only Metrika traffic + organic search phrases for Ads Sources.
 */
import { metrikaCounterId, metrikaToken } from "./env";

export type PeriodDays = 7 | 14 | 30 | 90;

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
  reaches: number | null;
  cr: number | null;
  /** @deprecated keep for older snapshots */
  reaches7d?: number | null;
  reaches30d?: number | null;
  cr7d?: number | null;
};

export type SearchPhraseRow = {
  phrase: string;
  engine: string;
  visits: number;
  users: number;
  bounceRate: number | null;
};

export type MetrikaTraffic = {
  visits: number;
  users: number;
  pageviews: number;
  bounceRate: number | null;
  avgDurationSec: number | null;
};

export type MetrikaSnapshot = {
  counterId: string | null;
  periodDays: PeriodDays;
  range: { from: string; to: string };
  /** aliases for older UI */
  range7d?: { from: string; to: string };
  range30d?: { from: string; to: string };
  goals: MetrikaGoalRow[];
  mappedGoals: MetrikaMappedGoal[];
  traffic: MetrikaTraffic | null;
  trafficOrganic: MetrikaTraffic | null;
  traffic7d?: MetrikaTraffic | null;
  traffic30d?: MetrikaTraffic | null;
  daily: { date: string; visits: number; users: number; organicVisits: number }[];
  bySource: { source: string; visits: number; users: number; bounceRate: number | null }[];
  byDevice: { device: string; visits: number; users: number }[];
  bySearchEngine: { engine: string; visits: number; users: number; bounceRate: number | null }[];
  topLandings: { path: string; visits: number; bounceRate: number | null }[];
  /** Organic search phrases that brought visits from search engines */
  searchPhrases: SearchPhraseRow[];
  topSearchPhrases?: { phrase: string; visits: number }[];
  offlineUploadingsOk: boolean | null;
  /** Non-fatal Metrika sub-query errors (auth/traffic still required). */
  partialErrors?: string[];
};

const MAPPED = [
  { env: "ADS_GOAL_REGISTRATION", label: "Регистрация" },
  { env: "ADS_GOAL_FIRST_PAYMENT", label: "Первая оплата" },
  { env: "ADS_GOAL_FIRST_RUNE_SPEND", label: "Первый расход рун" },
  { env: "ADS_GOAL_CLAIM", label: "Claim гостя" },
  { env: "ADS_GOAL_GUEST_SPREAD_START", label: "Старт гостевого расклада" },
] as const;

const ORGANIC_FILTER = encodeURIComponent("ym:s:lastTrafficSource=='organic'");

function oauthHeaders() {
  const token = metrikaToken();
  if (!token) return null;
  return { Authorization: `OAuth ${token}` };
}

function dayOffset(offset: number): string {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
}

function rangeFor(days: PeriodDays): { from: string; to: string } {
  return { from: dayOffset(-(days - 1)), to: dayOffset(0) };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function metrikaJson(
  pathAndQuery: string
): Promise<Record<string, unknown>> {
  const headers = oauthHeaders();
  if (!headers) {
    throw new Error("Metrika credentials missing: METRIKA_TOKEN|YANDEX_METRIKA_OAUTH_TOKEN");
  }
  let last = "Metrika request failed";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`https://api-metrika.yandex.net${pathAndQuery}`, {
        headers,
      });
      if (res.status === 429 || res.status >= 500) {
        last = `Metrika ${res.status}`;
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Metrika ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`
        );
      }
      return (await res.json()) as Record<string, unknown>;
    } catch (e) {
      if (e instanceof Error && /^Metrika (401|403|4\d\d)/.test(e.message)) {
        throw e;
      }
      last = e instanceof Error ? e.message : String(e);
      await sleep(300 * (attempt + 1));
    }
  }
  throw new Error(last);
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
  date2: string,
  filters?: string
): Promise<MetrikaTraffic> {
  const filterQ = filters ? `&filters=${filters}` : "";
  const json = await metrikaJson(
    `/stat/v1/data?ids=${counter}` +
      `&metrics=ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:avgVisitDurationSeconds` +
      `&date1=${date1}&date2=${date2}&accuracy=full${filterQ}`
  );
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
  return num((json.totals as unknown[])?.[0]);
}

async function dailySeries(
  counter: string,
  date1: string,
  date2: string
): Promise<MetrikaSnapshot["daily"]> {
  const [all, organic] = await Promise.all([
    metrikaJson(
      `/stat/v1/data?ids=${counter}` +
        `&metrics=ym:s:visits,ym:s:users` +
        `&dimensions=ym:s:date` +
        `&date1=${date1}&date2=${date2}&sort=ym:s:date&limit=100&accuracy=full`
    ),
    metrikaJson(
      `/stat/v1/data?ids=${counter}` +
        `&metrics=ym:s:visits` +
        `&dimensions=ym:s:date` +
        `&date1=${date1}&date2=${date2}&sort=ym:s:date&limit=100&accuracy=full` +
        `&filters=${ORGANIC_FILTER}`
    ),
  ]);
  const organicByDate = new Map<string, number>();
  for (const r of (organic?.data as { dimensions?: { name?: string }[]; metrics?: unknown[] }[]) ||
    []) {
    const d = r.dimensions?.[0]?.name || "";
    if (d) organicByDate.set(d, num(r.metrics?.[0]));
  }
  const rows =
    (all?.data as { dimensions?: { name?: string }[]; metrics?: unknown[] }[]) || [];
  return rows
    .map((r) => {
      const date = r.dimensions?.[0]?.name || "";
      return {
        date,
        visits: num(r.metrics?.[0]),
        users: num(r.metrics?.[1]),
        organicVisits: organicByDate.get(date) ?? 0,
      };
    })
    .filter((r) => r.date);
}

async function byDim(
  counter: string,
  date1: string,
  date2: string,
  dimension: string,
  limit: number,
  filters?: string
): Promise<{ name: string; visits: number; users: number; bounceRate: number | null }[]> {
  const filterQ = filters ? `&filters=${filters}` : "";
  const json = await metrikaJson(
    `/stat/v1/data?ids=${counter}` +
      `&metrics=ym:s:visits,ym:s:users,ym:s:bounceRate` +
      `&dimensions=${encodeURIComponent(dimension)}` +
      `&date1=${date1}&date2=${date2}&sort=-ym:s:visits&limit=${limit}&accuracy=full${filterQ}`
  );
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

/** Phrases that brought traffic FROM search engines (organic). */
async function organicSearchPhrases(
  counter: string,
  date1: string,
  date2: string
): Promise<SearchPhraseRow[]> {
  const json = await metrikaJson(
    `/stat/v1/data?ids=${counter}` +
      `&metrics=ym:s:visits,ym:s:users,ym:s:bounceRate` +
      `&dimensions=ym:s:lastSearchPhrase,ym:s:lastSearchEngineRoot` +
      `&date1=${date1}&date2=${date2}&sort=-ym:s:visits&limit=50&accuracy=full` +
      `&filters=${ORGANIC_FILTER}`
  );
  const rows =
    (json.data as {
      dimensions?: { name?: string }[];
      metrics?: unknown[];
    }[]) || [];
  return rows
    .map((r) => {
      const phrase = (r.dimensions?.[0]?.name || "").trim();
      const engine = (r.dimensions?.[1]?.name || "Поиск").trim() || "Поиск";
      return {
        phrase,
        engine,
        visits: num(r.metrics?.[0]),
        users: num(r.metrics?.[1]),
        bounceRate: pct(r.metrics?.[2]),
      };
    })
    .filter(
      (r) =>
        r.phrase &&
        r.phrase !== "(not set)" &&
        r.phrase !== "(не задано)" &&
        !/^not provided$/i.test(r.phrase) &&
        r.visits > 0
    );
}

export function parsePeriodDays(raw: unknown): PeriodDays {
  const n = Number(raw);
  if (n === 7 || n === 14 || n === 30 || n === 90) return n;
  return 30;
}

export async function fetchMetrikaSnapshot(
  periodDays: PeriodDays = 30
): Promise<MetrikaSnapshot> {
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

  const range = rangeFor(periodDays);
  const { from: date1, to: date2 } = range;

  let goals: MetrikaGoalRow[] = [];
  const partialErrors: string[] = [];
  try {
    const res = await fetch(
      `https://api-metrika.yandex.net/management/v1/counter/${counterId}/goals`,
      { headers }
    );
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Metrika goals ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`
      );
    }
    if (res.ok) {
      const json = (await res.json()) as {
        goals?: { id: number; name: string; type?: string }[];
      };
      goals = (json.goals || []).map((g) => ({ id: g.id, name: g.name, type: g.type }));
    } else {
      const body = await res.text().catch(() => "");
      partialErrors.push(
        `goals HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`
      );
    }
  } catch (e) {
    if (e instanceof Error && /Metrika goals (401|403)/.test(e.message)) throw e;
    partialErrors.push(`goals: ${e instanceof Error ? e.message : String(e)}`);
  }

  const r7 = rangeFor(7);
  const r30 = rangeFor(30);
  async function settle<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      partialErrors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      return fallback;
    }
  }

  // Traffic totals are required; optional dimensions must not fail the snapshot.
  const traffic = await trafficTotals(counterId, date1, date2);
  const trafficOrganic = await settle(
    "organic",
    () => trafficTotals(counterId, date1, date2, ORGANIC_FILTER),
    null
  );
  const traffic7d =
    periodDays === 7
      ? traffic
      : await settle("traffic7d", () => trafficTotals(counterId, r7.from, r7.to), traffic);
  const traffic30d =
    periodDays === 30
      ? traffic
      : await settle("traffic30d", () => trafficTotals(counterId, r30.from, r30.to), traffic);
  const daily = await settle("daily", () => dailySeries(counterId, date1, date2), []);
  const sources = await settle(
    "bySource",
    () => byDim(counterId, date1, date2, "ym:s:lastTrafficSource", 12),
    []
  );
  const devices = await settle(
    "byDevice",
    () => byDim(counterId, date1, date2, "ym:s:deviceCategory", 8),
    []
  );
  const engines = await settle(
    "bySearchEngine",
    () => byDim(counterId, date1, date2, "ym:s:lastSearchEngineRoot", 10, ORGANIC_FILTER),
    []
  );
  const landings = await settle(
    "landings",
    () => byDim(counterId, date1, date2, "ym:s:startURLPath", 20),
    []
  );
  const phrases = await settle(
    "searchPhrases",
    () => organicSearchPhrases(counterId, date1, date2),
    []
  );

  const byId = new Map(goals.map((g) => [g.id, g.name]));
  const visits = traffic?.visits || 0;
  const mappedGoals: MetrikaMappedGoal[] = [];
  for (const m of MAPPED) {
    const id = Number(process.env[m.env]) || null;
    const reaches = id
      ? await settle(`goal:${m.env}`, () => goalReaches(counterId, id, date1, date2), null)
      : null;
    mappedGoals.push({
      env: m.env,
      label: m.label,
      id,
      name: id ? byId.get(id) || m.label : null,
      reaches,
      cr: reaches != null && visits > 0 ? reaches / visits : null,
      reaches7d: periodDays === 7 ? reaches : null,
      reaches30d: periodDays === 30 ? reaches : null,
      cr7d: periodDays === 7 && reaches != null && visits > 0 ? reaches / visits : null,
    });
  }

  let offlineUploadingsOk: boolean | null = null;
  try {
    const res = await fetch(
      `https://api-metrika.yandex.net/management/v1/counter/${counterId}/offline_conversions/uploadings`,
      { headers }
    );
    offlineUploadingsOk = res.ok;
    if (!res.ok) {
      partialErrors.push(`offline_uploadings HTTP ${res.status}`);
    }
  } catch (e) {
    offlineUploadingsOk = false;
    partialErrors.push(
      `offline_uploadings: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return {
    counterId,
    periodDays,
    range,
    range7d: rangeFor(7),
    range30d: rangeFor(30),
    goals: goals.slice(0, 100),
    mappedGoals,
    traffic,
    trafficOrganic,
    traffic7d: periodDays === 7 ? traffic : traffic7d,
    traffic30d: periodDays === 30 ? traffic : traffic30d,
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
    bySearchEngine: engines.map((e) => ({
      engine: e.name,
      visits: e.visits,
      users: e.users,
      bounceRate: e.bounceRate,
    })),
    topLandings: landings.map((l) => ({
      path: l.name,
      visits: l.visits,
      bounceRate: l.bounceRate,
    })),
    searchPhrases: phrases,
    topSearchPhrases: phrases.map((p) => ({ phrase: p.phrase, visits: p.visits })),
    offlineUploadingsOk,
    partialErrors: partialErrors.length ? partialErrors : undefined,
  };
}

export async function persistMetrikaGoalStats(
  snapshot: MetrikaSnapshot
): Promise<void> {
  const { adsQuery } = await import("../db");
  const date = new Date().toISOString().slice(0, 10);
  for (const g of snapshot.mappedGoals) {
    const reaches = g.reaches ?? g.reaches7d;
    if (g.id == null || reaches == null) continue;
    await adsQuery(
      `INSERT INTO ads.metrika_goal_stat (date, goal_id, goal_name, reaches)
       VALUES ($1::date, $2, $3, $4)
       ON CONFLICT (date, goal_id) DO UPDATE SET
         goal_name = EXCLUDED.goal_name,
         reaches = EXCLUDED.reaches`,
      [date, g.id, g.name || g.label, reaches]
    );
  }
}
