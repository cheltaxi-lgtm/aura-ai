import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { botConfig } from "../config.js";
import { getDb, nowIso } from "../db/client.js";
import { findSessionByTokenHash, trackEvent } from "../db/repos.js";
import {
  GUEST_MASTER_ID,
  GUEST_SPREAD_ID,
  GUEST_SYSTEM,
  toSiteGuestSymbols,
} from "../domain/session/guest-contract.js";
import { hashSessionToken, isSessionToken } from "../domain/session/token.js";

const hits = new Map<string, { n: number; reset: number }>();

function rateOk(ip: string, limit = 60): boolean {
  const now = Date.now();
  const slot = hits.get(ip);
  if (!slot || slot.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  slot.n += 1;
  return slot.n <= limit;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function secretOk(req: IncomingMessage): boolean {
  const expected = botConfig.internalSecret;
  if (!expected) return false;
  const got = String(req.headers["x-bot-internal-secret"] || "");
  try {
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Pad response timing slightly so miss/hit are closer. */
async function settle(start: number, minMs = 40): Promise<void> {
  const elapsed = Date.now() - start;
  if (elapsed < minMs) {
    await new Promise((r) => setTimeout(r, minMs - elapsed));
  }
}

function sessionPayload(row: {
  id: string;
  question: string;
  cards: string;
  fingerprint: string | null;
  expires_at: string;
  created_at: string;
  claimed_at: string | null;
  teaser_text: string | null;
}) {
  let cards: Array<{ id: number; name: string; position: number; reversed: boolean }> = [];
  try {
    const raw = JSON.parse(row.cards) as Array<{
      id: number;
      name: string;
      position: number;
      reversed: boolean;
    }>;
    cards = toSiteGuestSymbols(raw);
  } catch {
    cards = [];
  }
  return {
    id: row.id,
    question: row.question,
    symbols: cards,
    system: GUEST_SYSTEM,
    master: GUEST_MASTER_ID,
    spread_id: GUEST_SPREAD_ID,
    fingerprint: row.fingerprint,
    expires_at: row.expires_at,
    created_at: row.created_at,
    claimed_at: row.claimed_at,
    teaser_text: row.teaser_text,
  };
}

export async function handleInternalReceipt(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  if (path !== "/internal/receipt/verify" && path !== "/internal/receipt/claim") {
    return false;
  }
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return true;
  }

  const start = Date.now();
  const ip = req.socket.remoteAddress || "unknown";
  if (!rateOk(ip)) {
    await settle(start);
    json(res, 429, { ok: false, error: "rate_limit" });
    return true;
  }

  if (!secretOk(req)) {
    await settle(start);
    json(res, 401, { ok: false, error: "unauthorized" });
    return true;
  }

  let body: { token?: string; zovus_user_id?: string };
  try {
    body = JSON.parse(await readBody(req)) as { token?: string; zovus_user_id?: string };
  } catch {
    await settle(start);
    json(res, 400, { ok: false, error: "invalid_token" });
    return true;
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!isSessionToken(token)) {
    await settle(start);
    json(res, 400, { ok: false, error: "invalid_token" });
    return true;
  }

  const hash = hashSessionToken(token);
  const row = findSessionByTokenHash(hash);

  if (path === "/internal/receipt/verify") {
    if (!row) {
      await settle(start);
      json(res, 404, { ok: false, error: "invalid_token" });
      return true;
    }
    if (row.claimable === 0) {
      await settle(start);
      json(res, 409, { ok: false, error: "unclaimable" });
      return true;
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await settle(start);
      json(res, 410, { ok: false, error: "expired" });
      return true;
    }
    if (row.claimed_at) {
      await settle(start);
      json(res, 409, { ok: false, error: "already_claimed" });
      return true;
    }
    await settle(start);
    json(res, 200, { ok: true, session: sessionPayload(row) });
    return true;
  }

  // claim
  const zovusUserId =
    typeof body.zovus_user_id === "string" ? body.zovus_user_id.trim() : "";
  if (!zovusUserId || zovusUserId.length > 80) {
    await settle(start);
    json(res, 400, { ok: false, error: "invalid_token" });
    return true;
  }

  if (!row) {
    await settle(start);
    json(res, 404, { ok: false, error: "invalid_token" });
    return true;
  }
  if (row.claimable === 0) {
    await settle(start);
    json(res, 409, { ok: false, error: "unclaimable" });
    return true;
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await settle(start);
    json(res, 410, { ok: false, error: "expired" });
    return true;
  }

  const db = getDb();
  const claimedAt = nowIso();

  if (row.claimed_at) {
    // Idempotent if same zovus user already linked on bot profile
    const user = db
      .prepare(`SELECT zovus_user_id FROM bot_users WHERE telegram_user_id = ?`)
      .get(row.telegram_user_id) as { zovus_user_id: string | null } | undefined;
    if (user?.zovus_user_id === zovusUserId) {
      await settle(start);
      json(res, 200, {
        ok: true,
        alreadyClaimed: true,
        session: sessionPayload(row),
      });
      return true;
    }
    await settle(start);
    json(res, 409, { ok: false, error: "already_claimed" });
    return true;
  }

  const updated = db
    .prepare(
      `UPDATE bot_guest_sessions
       SET claimed_at = ?
       WHERE id = ? AND claimed_at IS NULL AND COALESCE(claimable, 0) = 1
       RETURNING id`
    )
    .get(claimedAt, row.id) as { id: string } | undefined;

  if (!updated) {
    await settle(start);
    json(res, 409, { ok: false, error: "already_claimed" });
    return true;
  }

  db.prepare(
    `UPDATE bot_users SET zovus_user_id = ?, updated_at = ? WHERE telegram_user_id = ?`
  ).run(zovusUserId, claimedAt, row.telegram_user_id);

  trackEvent("receipt_claimed", row.telegram_user_id, {
    session_id: row.id,
    // never log token or question text
  });

  const fresh = findSessionByTokenHash(hash)!;
  await settle(start);
  json(res, 200, {
    ok: true,
    alreadyClaimed: false,
    session: sessionPayload(fresh),
  });
  return true;
}
