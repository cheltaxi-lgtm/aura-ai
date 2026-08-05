import { proQuery } from "../db";
import { mintProToken, hashProToken } from "../tokens";
import { getProDialogModeMax, isProDeliveryEnabled } from "../config";
import { assertCanDeliver } from "../domain/invariants";
import { listVersions, markDelivered, getCase } from "./cases";
import { writeAudit } from "./accounts";

export type ProDeliveryRow = {
  id: string;
  case_id: string;
  token_hash: string;
  token_prefix: string;
  ttl_expires_at: Date | null;
  revoked_at: Date | null;
  view_count: number;
  first_viewed_at: Date | null;
  last_viewed_at: Date | null;
  dialog_mode: "a" | "b" | "c";
  dialog_quota: number;
  dialog_window_days: number;
  created_at: Date;
};

const TTL_DAYS: Record<string, number | null> = {
  "7": 7,
  "30": 30,
  "90": 90,
  forever: null,
};

export async function createDelivery(
  accountId: string | number,
  caseId: string | number,
  opts: {
    ttl: "7" | "30" | "90" | "forever";
    dialogMode?: "a" | "b" | "c";
    dialogQuota?: number;
    actorUserId: string;
  }
): Promise<{ delivery: ProDeliveryRow; rawToken: string }> {
  if (!isProDeliveryEnabled()) {
    throw Object.assign(new Error("delivery_disabled"), { status: 403 });
  }
  const c = await getCase(accountId, caseId);
  if (!c) throw Object.assign(new Error("case_not_found"), { status: 404 });
  const versions = await listVersions(caseId);
  assertCanDeliver(versions);

  const maxMode = getProDialogModeMax();
  let dialogMode = opts.dialogMode ?? "b";
  if (dialogMode === "c" && maxMode !== "c") dialogMode = "b";
  if (dialogMode === "b" && maxMode === "a") dialogMode = "a";

  const minted = mintProToken("zp");
  const days = TTL_DAYS[opts.ttl];
  const expires =
    days == null ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const { rows } = await proQuery<ProDeliveryRow>(
    `INSERT INTO pro.deliveries
       (case_id, token_hash, token_prefix, ttl_expires_at, dialog_mode, dialog_quota)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      caseId,
      minted.hash,
      minted.tokenPrefix,
      expires,
      dialogMode,
      opts.dialogQuota ?? 5,
    ]
  );
  await markDelivered(accountId, caseId);

  const { rows: threads } = await proQuery<{ id: string }>(
    `INSERT INTO pro.client_threads (delivery_id, case_id, account_id, client_id, status)
     VALUES ($1, $2, $3, $4, 'open')
     RETURNING id`,
    [rows[0]!.id, caseId, accountId, c.client_id]
  );
  void threads;

  await writeAudit({
    accountId,
    actor: "user",
    actorUserId: opts.actorUserId,
    action: "delivery.create",
    target: String(rows[0]!.id),
    meta: { caseId, dialogMode },
  });

  return { delivery: rows[0]!, rawToken: minted.raw };
}

export async function revokeDelivery(
  accountId: string | number,
  deliveryId: string | number,
  actorUserId: string
): Promise<boolean> {
  const { rowCount } = await proQuery(
    `UPDATE pro.deliveries d SET revoked_at = NOW()
     FROM pro.cases c
     WHERE d.id = $1 AND d.case_id = c.id AND c.account_id = $2
       AND d.revoked_at IS NULL`,
    [deliveryId, accountId]
  );
  if (rowCount) {
    await writeAudit({
      accountId,
      actor: "user",
      actorUserId,
      action: "delivery.revoke",
      target: String(deliveryId),
    });
  }
  return Boolean(rowCount);
}

export async function resolveDeliveryByRawToken(raw: string): Promise<{
  delivery: ProDeliveryRow;
  accountId: string;
  caseId: string;
  clientId: string;
} | null> {
  const hash = hashProToken(raw);
  const { rows } = await proQuery<
    ProDeliveryRow & { account_id: string; client_id: string }
  >(
    `SELECT d.*, c.account_id, c.client_id
     FROM pro.deliveries d
     JOIN pro.cases c ON c.id = d.case_id
     WHERE d.token_hash = $1
     LIMIT 1`,
    [hash]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.ttl_expires_at && new Date(row.ttl_expires_at).getTime() < Date.now()) {
    return null;
  }
  return {
    delivery: row,
    accountId: row.account_id,
    caseId: row.case_id,
    clientId: row.client_id,
  };
}

export async function touchDeliveryView(deliveryId: string | number): Promise<{
  firstOpen: boolean;
}> {
  const { rows } = await proQuery<{ first_viewed_at: Date | null }>(
    `SELECT first_viewed_at FROM pro.deliveries WHERE id = $1`,
    [deliveryId]
  );
  const firstOpen = !rows[0]?.first_viewed_at;
  await proQuery(
    `UPDATE pro.deliveries SET
       view_count = view_count + 1,
       first_viewed_at = COALESCE(first_viewed_at, NOW()),
       last_viewed_at = NOW()
     WHERE id = $1`,
    [deliveryId]
  );
  return { firstOpen };
}
