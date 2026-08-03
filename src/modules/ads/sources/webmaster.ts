/**
 * Read-only Webmaster popular queries + summary.
 * API returns only ONE indicator per request → merge 3 reports.
 */
import { webmasterHostId, webmasterToken } from "./env";

export type WebmasterQuery = {
  query: string;
  clicks: number;
  shows: number;
  position: number | null;
  ctr: number | null;
};

export type WebmasterSnapshot = {
  hostId: string | null;
  hostDisplay: string | null;
  queries: WebmasterQuery[];
  dateFrom: string | null;
  dateTo: string | null;
  totals: {
    clicks: number;
    shows: number;
    avgPosition: number | null;
    ctr: number | null;
    queryCount: number;
  };
};

type Indicator = "TOTAL_CLICKS" | "TOTAL_SHOWS" | "AVG_SHOW_POSITION";

async function fetchIndicatorReport(input: {
  uid: number;
  hostId: string;
  token: string;
  dateFrom: string;
  dateTo: string;
  indicator: Indicator;
  orderBy: Indicator;
  limit: number;
}): Promise<Map<string, number>> {
  const encodedHost = encodeURIComponent(input.hostId);
  const url =
    `https://api.webmaster.yandex.net/v4/user/${input.uid}/hosts/${encodedHost}/search-queries/popular` +
    `?date_from=${input.dateFrom}&date_to=${input.dateTo}` +
    `&query_indicator=${input.indicator}&order_by=${input.orderBy}&limit=${input.limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `OAuth ${input.token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `webmaster ${input.indicator} ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`
    );
  }
  const json = (await res.json()) as {
    queries?: { query_text?: string; indicators?: Record<string, number> }[];
  };
  const map = new Map<string, number>();
  for (const q of json.queries || []) {
    const text = q.query_text || "";
    if (!text) continue;
    const v = Number(q.indicators?.[input.indicator]);
    if (Number.isFinite(v)) map.set(text, v);
  }
  return map;
}

export async function fetchWebmasterSnapshot(): Promise<WebmasterSnapshot> {
  const token = webmasterToken();
  const hostId = webmasterHostId();
  if (!token) {
    throw new Error(
      "Webmaster token missing: set WEBMASTER_TOKEN (or reuse METRIKA/YANDEX_METRIKA/ADS_DIRECT OAuth with webmaster scopes)"
    );
  }
  if (!hostId) {
    throw new Error("WEBMASTER_HOST_ID missing (example: https:zovus.ru:443)");
  }

  const headers = { Authorization: `OAuth ${token}` };
  const userRes = await fetch("https://api.webmaster.yandex.net/v4/user", { headers });
  if (!userRes.ok) {
    const body = await userRes.text().catch(() => "");
    throw new Error(
      `webmaster user ${userRes.status}${body ? `: ${body.slice(0, 160)}` : ""}`
    );
  }
  const uj = (await userRes.json()) as { user_id?: number };
  const uid = uj.user_id ?? null;
  if (!uid) {
    throw new Error("webmaster user_id missing in API response");
  }

  const to = new Date();
  const from = new Date(to.getTime() - 28 * 86400000);
  const dateFrom = from.toISOString().slice(0, 10);
  const dateTo = to.toISOString().slice(0, 10);
  const base = { uid, hostId, token, dateFrom, dateTo, limit: 100 };

  const [showsMap, clicksMap, posMap] = await Promise.all([
    fetchIndicatorReport({ ...base, indicator: "TOTAL_SHOWS", orderBy: "TOTAL_SHOWS" }),
    fetchIndicatorReport({ ...base, indicator: "TOTAL_CLICKS", orderBy: "TOTAL_CLICKS" }),
    fetchIndicatorReport({
      ...base,
      indicator: "AVG_SHOW_POSITION",
      orderBy: "TOTAL_SHOWS",
    }),
  ]);

  const keys = new Set<string>([
    ...showsMap.keys(),
    ...clicksMap.keys(),
    ...posMap.keys(),
  ]);
  const queries: WebmasterQuery[] = [...keys].map((query) => {
    const clicks = clicksMap.get(query) ?? 0;
    const shows = showsMap.get(query) ?? 0;
    const position = posMap.has(query) ? posMap.get(query)! : null;
    const ctr = shows > 0 ? clicks / shows : null;
    return { query, clicks, shows, position, ctr };
  });

  queries.sort((a, b) => b.clicks - a.clicks || b.shows - a.shows);

  const clicks = queries.reduce((s, q) => s + q.clicks, 0);
  const shows = queries.reduce((s, q) => s + q.shows, 0);
  const posWeighted = queries.reduce(
    (acc, q) => {
      if (q.position == null || q.shows <= 0) return acc;
      return { sum: acc.sum + q.position * q.shows, w: acc.w + q.shows };
    },
    { sum: 0, w: 0 }
  );

  return {
    hostId,
    hostDisplay: hostId.replace(/^https?:/, "").replace(/:443$/, ""),
    queries,
    dateFrom,
    dateTo,
    totals: {
      clicks,
      shows,
      avgPosition: posWeighted.w > 0 ? posWeighted.sum / posWeighted.w : null,
      ctr: shows > 0 ? clicks / shows : null,
      queryCount: queries.length,
    },
  };
}

export async function persistWebmasterQueries(snapshot: WebmasterSnapshot): Promise<void> {
  if (!snapshot.dateTo || !snapshot.queries.length) return;
  const { adsQuery } = await import("../db");
  const date = snapshot.dateTo;
  for (const q of snapshot.queries.slice(0, 100)) {
    await adsQuery(
      `INSERT INTO ads.webmaster_query_daily (date, query, clicks, shows, position)
       VALUES ($1::date, $2, $3, $4, $5)
       ON CONFLICT (date, query) DO UPDATE SET
         clicks = EXCLUDED.clicks,
         shows = EXCLUDED.shows,
         position = EXCLUDED.position`,
      [date, q.query.slice(0, 500), q.clicks, q.shows, q.position]
    );
  }
}
