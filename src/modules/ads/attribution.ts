import { createHash, randomUUID } from "node:crypto";
import { adsQuery } from "./db";
import type { MicroConversionType } from "./types";

export const ADS_CID_COOKIE = "ads_cid";
export const ADS_CID_TTL_SEC = 90 * 24 * 60 * 60;

export function hashVisitor(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

export async function createClick(input: {
  yclid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  landing_path: string;
  visitor_hash?: string | null;
}): Promise<string> {
  const id = randomUUID();
  await adsQuery(
    `INSERT INTO ads.click
      (id, yclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term, landing_path, visitor_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      input.yclid || null,
      input.utm_source || null,
      input.utm_medium || null,
      input.utm_campaign || null,
      input.utm_content || null,
      input.utm_term || null,
      input.landing_path || "/",
      input.visitor_hash || null,
    ]
  );
  return id;
}

export async function linkClickUser(clickId: string, userId: string): Promise<boolean> {
  const { rowCount } = await adsQuery(
    `INSERT INTO ads.click_user (click_id, user_id)
     VALUES ($1::uuid, $2::uuid)
     ON CONFLICT (user_id) DO NOTHING`,
    [clickId, userId]
  );
  return (rowCount ?? 0) > 0;
}

export async function recordMicroConversion(
  clickId: string,
  type: MicroConversionType,
  visitorHash?: string | null
): Promise<"ok" | "duplicate" | "missing_click"> {
  const exists = await adsQuery<{ id: string }>(
    "SELECT id FROM ads.click WHERE id = $1::uuid",
    [clickId]
  );
  if (!exists.rows[0]) return "missing_click";

  try {
    await adsQuery(
      `INSERT INTO ads.conversion (click_id, visitor_hash, type, occurred_at)
       VALUES ($1::uuid, $2, $3, NOW())`,
      [clickId, visitorHash || null, type]
    );
    return "ok";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate/i.test(msg)) return "duplicate";
    throw e;
  }
}

export async function recordServerConversion(input: {
  userId: string;
  type: string;
  amountRub?: number | null;
  occurredAt?: Date;
  clickId?: string | null;
}): Promise<"ok" | "duplicate"> {
  let clickId = input.clickId || null;
  if (!clickId) {
    const linked = await adsQuery<{ click_id: string }>(
      "SELECT click_id FROM ads.click_user WHERE user_id = $1::uuid",
      [input.userId]
    );
    clickId = linked.rows[0]?.click_id ?? null;
  }
  try {
    await adsQuery(
      `INSERT INTO ads.conversion (user_id, click_id, type, amount_rub, occurred_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
      [
        input.userId,
        clickId,
        input.type,
        input.amountRub ?? null,
        input.occurredAt ?? new Date(),
      ]
    );
    return "ok";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unique|duplicate/i.test(msg)) return "duplicate";
    throw e;
  }
}
