/**
 * Read-only Webmaster popular queries.
 */
import { webmasterHostId, webmasterToken } from "./env";

export type WebmasterQuery = {
  query: string;
  clicks: number;
  shows: number;
  position: number | null;
};

export type WebmasterSnapshot = {
  hostId: string | null;
  hostDisplay: string | null;
  queries: WebmasterQuery[];
  dateFrom: string | null;
  dateTo: string | null;
};

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
  const from = new Date(to.getTime() - 14 * 86400000);
  const dateFrom = from.toISOString().slice(0, 10);
  const dateTo = to.toISOString().slice(0, 10);
  const encodedHost = encodeURIComponent(hostId);

  const url =
    `https://api.webmaster.yandex.net/v4/user/${uid}/hosts/${encodedHost}/search-queries/popular` +
    `?date_from=${dateFrom}&date_to=${dateTo}&query_indicator=TOTAL_SHOWS&order_by=TOTAL_CLICKS&limit=50`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `webmaster queries ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`
    );
  }
  const json = (await res.json()) as {
    queries?: {
      query_text?: string;
      indicators?: {
        TOTAL_CLICKS?: number;
        TOTAL_SHOWS?: number;
        AVG_SHOW_POSITION?: number;
      };
    }[];
  };
  const queries: WebmasterQuery[] = (json.queries || [])
    .map((q) => ({
      query: q.query_text || "",
      clicks: Number(q.indicators?.TOTAL_CLICKS || 0),
      shows: Number(q.indicators?.TOTAL_SHOWS || 0),
      position:
        q.indicators?.AVG_SHOW_POSITION != null
          ? Number(q.indicators.AVG_SHOW_POSITION)
          : null,
    }))
    .filter((q) => q.query);

  return { hostId, hostDisplay: hostId, queries, dateFrom, dateTo };
}

export async function persistWebmasterQueries(snapshot: WebmasterSnapshot): Promise<void> {
  if (!snapshot.dateTo || !snapshot.queries.length) return;
  const { adsQuery } = await import("../db");
  const date = snapshot.dateTo;
  for (const q of snapshot.queries.slice(0, 50)) {
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
