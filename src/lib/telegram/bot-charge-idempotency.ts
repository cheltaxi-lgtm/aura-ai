import { createHash } from "node:crypto";
import { CHARGE_IDEM_WINDOW_SEC } from "@/lib/services/billing-service";
import { query } from "@/lib/db";

const EVENT_RE = /^[A-Za-z0-9_.:\-]+$/;

/** Normalize a client/telegram event id for charge keys (max 64). */
export function normalizeBotClientEventId(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.length > 64 || !EVENT_RE.test(trimmed)) return null;
  return trimmed;
}

export function botContentDigest(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 12);
}

/**
 * Stable bot product charge key — never includes a freshly created session id.
 * Prefer clientEventId (telegram update / flow-sticky id); fall back to content+window.
 */
export function buildBotProductChargeKey(input: {
  kind: "veronika" | "catalog";
  userId: string;
  clientEventId?: string | null;
  /** Question text or intent slug. */
  content: string;
  nowMs?: number;
}): string {
  const digest = botContentDigest(input.content.trim());
  const event = normalizeBotClientEventId(input.clientEventId);
  if (event) {
    return `tg-${input.kind}:${input.userId}:${event}:${digest}`;
  }
  const bucket = Math.floor((input.nowMs ?? Date.now()) / (CHARGE_IDEM_WINDOW_SEC * 1000));
  return `tg-${input.kind}:${input.userId}:q:${digest}:${bucket}`;
}

/**
 * Persist first-session id on the spend row (rune_transactions.result_session_id)
 * so charge dedupe can resume without a second createSession.
 * Call immediately after createSession, before LLM.
 */
export async function bindBotChargeSession(
  transactionId: string | undefined,
  sessionId: string
): Promise<void> {
  if (!transactionId || !sessionId) return;
  const { rowCount } = await query(
    `UPDATE rune_transactions
     SET result_session_id = COALESCE(result_session_id, $2::uuid)
     WHERE id = $1 AND type = 'spend'`,
    [transactionId, sessionId]
  );
  if (!rowCount) {
    console.warn("[billing] bindBotChargeSession: spend row missing", {
      transactionId,
      sessionId,
    });
  }
}

/** Read session id bound to a prior spend (dedupe path). No description parsing. */
export async function findSessionIdForBotCharge(
  transactionId: string | undefined
): Promise<string | null> {
  if (!transactionId) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { rows } = await query<{ result_session_id: string | null }>(
      `SELECT result_session_id::text AS result_session_id
       FROM rune_transactions
       WHERE id = $1 AND type = 'spend'
       LIMIT 1`,
      [transactionId]
    );
    const id = rows[0]?.result_session_id?.trim() || "";
    if (/^[0-9a-f-]{36}$/i.test(id)) return id;
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
    }
  }
  return null;
}
