/**
 * Upload offline conversions to Yandex Metrika.
 * registration (no sum); first_payment / repeat_payment (with sum).
 * Never upload spread_submit. Idempotent via uploaded_at.
 * No-op without METRIKA_TOKEN / YANDEX_METRIKA_OAUTH_TOKEN.
 */
import { adsQuery } from "./db";
import { metrikaCounterId, metrikaToken } from "./sources/env";

const UPLOAD_TYPES = ["registration", "first_payment", "repeat_payment"] as const;

export type OfflineConversionRow = {
  id: string;
  type: string;
  amount_rub: string | null;
  occurred_at: Date;
  yclid: string | null;
  client_id: string | null;
};

function metrikaBase(): string | null {
  const token = metrikaToken();
  const counter = metrikaCounterId();
  if (!token || !counter) return null;
  return `https://api-metrika.yandex.net/management/v1/counter/${counter}/offline_conversions`;
}

/** Build Metrika offline CSV. Never includes spread_submit (V24). */
export function buildOfflineConversionsCsv(rows: OfflineConversionRow[]): string {
  // Metrika offline CSV: ClientId or Yclid, Target, DateTime, Price, Currency
  const lines = ["Yclid,ClientId,Target,DateTime,Price,Currency"];
  for (const r of rows) {
    if (r.type === "spread_submit") continue;
    const ts = Math.floor(new Date(r.occurred_at).getTime() / 1000);
    const yclid = r.yclid || "";
    const clientId = r.client_id || "";
    const target = r.type;
    const withSum = r.type === "first_payment" || r.type === "repeat_payment";
    const price = withSum && r.amount_rub != null ? String(r.amount_rub) : "";
    const currency = withSum && price ? "RUB" : "";
    lines.push(
      [yclid, clientId, target, String(ts), price, currency].join(",")
    );
  }
  return lines.join("\n");
}

export async function uploadOfflineConversions(limit = 500): Promise<{
  skipped: boolean;
  uploaded: number;
  reason?: string;
}> {
  const base = metrikaBase();
  if (!base) {
    return { skipped: true, uploaded: 0, reason: "METRIKA_TOKEN or METRIKA_COUNTER_ID missing" };
  }

  const { rows } = await adsQuery<OfflineConversionRow>(
    `SELECT c.id, c.type, c.amount_rub::text, c.occurred_at,
            cl.yclid,
            NULLIF(cl.visitor_hash, '') AS client_id
     FROM ads.conversion c
     LEFT JOIN ads.click cl ON cl.id = c.click_id
     WHERE c.uploaded_at IS NULL
       AND c.type = ANY($1::text[])
       AND c.type <> 'spread_submit'
       AND (cl.yclid IS NOT NULL OR cl.visitor_hash IS NOT NULL)
     ORDER BY c.occurred_at ASC
     LIMIT $2`,
    [UPLOAD_TYPES as unknown as string[], limit]
  );

  if (!rows.length) {
    return { skipped: false, uploaded: 0 };
  }

  const csv = buildOfflineConversionsCsv(rows);
  const token = metrikaToken()!;
  const form = new FormData();
  form.append(
    "file",
    new Blob([csv], { type: "text/csv" }),
    "offline_conversions.csv"
  );
  // comment optional
  form.append("comment", "ads-autopilot");

  const res = await fetch(`${base}/uploadings?client_id_type=YCLID`, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}` },
    body: form,
  });

  if (!res.ok) {
    // Retry with CLIENT_ID if YCLID upload rejected
    const form2 = new FormData();
    form2.append(
      "file",
      new Blob([csv], { type: "text/csv" }),
      "offline_conversions.csv"
    );
    const res2 = await fetch(`${base}/uploadings?client_id_type=CLIENT_ID`, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}` },
      body: form2,
    });
    if (!res2.ok) {
      return {
        skipped: false,
        uploaded: 0,
        reason: `metrika upload HTTP ${res.status}/${res2.status}`,
      };
    }
  }

  const ids = rows.map((r) => r.id);
  await adsQuery(
    `UPDATE ads.conversion SET uploaded_at = NOW() WHERE id = ANY($1::uuid[])`,
    [ids]
  );

  return { skipped: false, uploaded: ids.length };
}
