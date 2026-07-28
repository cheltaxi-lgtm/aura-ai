/**
 * Read-only Metrika goals + traffic (no ads spend required).
 */
import { metrikaCounterId, metrikaToken } from "./env";

export type MetrikaGoalRow = {
  id: number;
  name: string;
  type?: string;
};

export type MetrikaSnapshot = {
  counterId: string | null;
  goals: MetrikaGoalRow[];
  mappedGoals: { env: string; id: number | null; name: string | null; reaches7d: number | null }[];
  traffic7d: { visits: number; users: number; pageviews: number } | null;
  traffic30d: { visits: number; users: number } | null;
  offlineUploadingsOk: boolean | null;
};

const MAPPED = [
  { env: "ADS_GOAL_REGISTRATION", label: "registration" },
  { env: "ADS_GOAL_FIRST_PAYMENT", label: "first_payment" },
  { env: "ADS_GOAL_FIRST_RUNE_SPEND", label: "first_rune_spend" },
  { env: "ADS_GOAL_CLAIM", label: "claim" },
  { env: "ADS_GOAL_GUEST_SPREAD_START", label: "guest_spread_start" },
] as const;

function oauthHeaders() {
  const token = metrikaToken();
  if (!token) return null;
  return { Authorization: `OAuth ${token}` };
}

async function goalReaches(
  counter: string,
  goalId: number,
  date1: string,
  date2: string
): Promise<number | null> {
  const headers = oauthHeaders();
  if (!headers) return null;
  try {
    const url =
      `https://api-metrika.yandex.net/stat/v1/data` +
      `?ids=${counter}&metrics=ym:s:goal${goalId}reaches` +
      `&date1=${date1}&date2=${date2}&accuracy=full`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const json = (await res.json()) as { totals?: (number | string)[] };
    const n = Number(json.totals?.[0] ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return null;
  }
}

async function traffic(
  counter: string,
  date1: string,
  date2: string
): Promise<{ visits: number; users: number; pageviews: number } | null> {
  const headers = oauthHeaders();
  if (!headers) return null;
  try {
    const url =
      `https://api-metrika.yandex.net/stat/v1/data` +
      `?ids=${counter}&metrics=ym:s:visits,ym:s:users,ym:s:pageviews` +
      `&date1=${date1}&date2=${date2}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const json = (await res.json()) as { totals?: (number | string)[] };
    return {
      visits: Number(json.totals?.[0] ?? 0),
      users: Number(json.totals?.[1] ?? 0),
      pageviews: Number(json.totals?.[2] ?? 0),
    };
  } catch {
    return null;
  }
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

  const day = (offset: number) => {
    const d = new Date(Date.now() + offset * 86400000);
    return d.toISOString().slice(0, 10);
  };
  const d0 = day(0);
  const d7 = day(-6);
  const d30 = day(-29);

  const byId = new Map(goals.map((g) => [g.id, g.name]));
  const mappedGoals = [];
  for (const m of MAPPED) {
    const id = Number(process.env[m.env]) || null;
    const reaches7d = id ? await goalReaches(counterId, id, d7, d0) : null;
    mappedGoals.push({
      env: m.env,
      id,
      name: id ? byId.get(id) || m.label : null,
      reaches7d,
    });
  }

  const traffic7d = await traffic(counterId, d7, d0);
  const t30 = await traffic(counterId, d30, d0);
  const traffic30d = t30 ? { visits: t30.visits, users: t30.users } : null;

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
    goals: goals.slice(0, 100),
    mappedGoals,
    traffic7d,
    traffic30d,
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
      [date, g.id, g.name, g.reaches7d]
    );
  }
}
