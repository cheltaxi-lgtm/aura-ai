import { createHash, randomBytes } from "crypto";

import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import {
  AURA_ENGINE_VERSION,
  AURA_GUEST_CLAIM_TTL_MS,
  type AuraSnapshot,
} from "@/lib/aura-constants";
import { isAuraReadingEnabled } from "@/lib/settings";

export type AuraGuestRow = {
  id: string;
  snapshot: AuraSnapshot;
  engine_version: string;
  claim_token_hash: string;
  claimed_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
  expires_at: string;
};

export type AuraGuestClaimResult =
  | {
      ok: true;
      status: "claimed" | "idempotent";
      snapshotId: string;
      snapshot: AuraSnapshot;
    }
  | {
      ok: false;
      code:
        | "NO_CLAIM_TOKEN"
        | "INVALID_TOKEN"
        | "EXPIRED"
        | "ALREADY_CLAIMED"
        | "DISABLED"
        | "NOT_FOUND";
    };

function hashAuraGuestClaimToken(rawToken: string): string {
  return createHash("sha256").update(`aura-guest-claim:v1:${rawToken}`).digest("hex");
}

export function createAuraGuestClaimToken(): string {
  return randomBytes(24).toString("hex");
}

async function sweepExpiredGuestSnapshots(client?: PoolClient): Promise<number> {
  const run = <T extends Record<string, unknown>>(text: string, params?: unknown[]) =>
    client ? queryClient<T>(client, text, params) : query<T>(text, params);
  const { rowCount } = await run(
    `DELETE FROM aura_guest_snapshots
     WHERE claimed_user_id IS NULL AND expires_at < NOW()`
  );
  return rowCount ?? 0;
}

/**
 * Persist the structured guest snapshot (never the photo) and return the raw
 * claim token — caller sets it as an HttpOnly cookie.
 */
export async function createGuestAuraSnapshot(snapshot: AuraSnapshot): Promise<{
  rawClaimToken: string;
  snapshotId: string;
  expiresAt: string;
}> {
  if (!(await isAuraReadingEnabled())) {
    throw new Error("AURA_DISABLED");
  }

  await sweepExpiredGuestSnapshots();

  const rawClaimToken = createAuraGuestClaimToken();
  const claimHash = hashAuraGuestClaimToken(rawClaimToken);
  const expiresAt = new Date(Date.now() + AURA_GUEST_CLAIM_TTL_MS).toISOString();

  const { rows } = await query<{ id: string; expires_at: string }>(
    `INSERT INTO aura_guest_snapshots (
       snapshot, engine_version, claim_token_hash, expires_at
     ) VALUES ($1::jsonb, $2, $3, $4::timestamptz)
     RETURNING id, expires_at::text`,
    [JSON.stringify(snapshot), AURA_ENGINE_VERSION, claimHash, expiresAt]
  );

  const row = rows[0];
  if (!row) throw new Error("GUEST_AURA_INSERT_FAILED");

  return { rawClaimToken, snapshotId: row.id, expiresAt: row.expires_at };
}

/**
 * Atomic claim: cookie token hash → bind the EXACT stored snapshot to the user.
 * No re-shoot, no recompute — the same reading continues after auth.
 */
export async function claimGuestAuraSnapshot(opts: {
  profileUserId: string;
  rawClaimToken: string | null | undefined;
}): Promise<AuraGuestClaimResult> {
  if (!(await isAuraReadingEnabled())) {
    return { ok: false, code: "DISABLED" };
  }

  const raw = typeof opts.rawClaimToken === "string" ? opts.rawClaimToken.trim() : "";
  if (!raw || !/^[0-9a-f]{48}$/i.test(raw)) {
    return { ok: false, code: "NO_CLAIM_TOKEN" };
  }

  const claimHash = hashAuraGuestClaimToken(raw.toLowerCase());

  return withTransaction(async (client) => {
    await queryClient(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `aura-guest-claim:${opts.profileUserId}`,
    ]);

    const { rows } = await queryClient<AuraGuestRow>(
      client,
      `SELECT id, snapshot, engine_version, claim_token_hash,
              claimed_user_id, claimed_at::text, created_at::text, expires_at::text
       FROM aura_guest_snapshots
       WHERE claim_token_hash = $1
       FOR UPDATE`,
      [claimHash]
    );
    const guest = rows[0];
    if (!guest) {
      await sweepExpiredGuestSnapshots(client);
      return { ok: false, code: "INVALID_TOKEN" };
    }

    if (guest.claimed_user_id) {
      if (guest.claimed_user_id === opts.profileUserId) {
        return {
          ok: true,
          status: "idempotent",
          snapshotId: guest.id,
          snapshot: guest.snapshot,
        };
      }
      return { ok: false, code: "ALREADY_CLAIMED" };
    }

    if (new Date(guest.expires_at).getTime() < Date.now()) {
      await queryClient(client, `DELETE FROM aura_guest_snapshots WHERE id = $1`, [guest.id]);
      await sweepExpiredGuestSnapshots(client);
      return { ok: false, code: "EXPIRED" };
    }

    const { rowCount } = await queryClient(
      client,
      `UPDATE aura_guest_snapshots
       SET claimed_user_id = $2, claimed_at = NOW()
       WHERE id = $1 AND claimed_user_id IS NULL`,
      [guest.id, opts.profileUserId]
    );
    if (!rowCount) {
      return { ok: false, code: "ALREADY_CLAIMED" };
    }

    return {
      ok: true,
      status: "claimed",
      snapshotId: guest.id,
      snapshot: guest.snapshot,
    };
  });
}

/** Load a claimed snapshot owned by the user (for the paid report pass). */
export async function getClaimedAuraSnapshot(opts: {
  snapshotId: string;
  profileUserId: string;
}): Promise<AuraSnapshot | null> {
  const { rows } = await query<{ snapshot: AuraSnapshot }>(
    `SELECT snapshot
     FROM aura_guest_snapshots
     WHERE id = $1 AND claimed_user_id = $2`,
    [opts.snapshotId, opts.profileUserId]
  );
  return rows[0]?.snapshot ?? null;
}

/** Latest claimed snapshot without a finished paid report — resume target. */
export async function getLatestClaimedAuraSnapshot(
  profileUserId: string
): Promise<{ id: string; snapshot: AuraSnapshot; claimedAt: string } | null> {
  const { rows } = await query<{ id: string; snapshot: AuraSnapshot; claimed_at: string }>(
    `SELECT id, snapshot, claimed_at::text
     FROM aura_guest_snapshots
     WHERE claimed_user_id = $1
     ORDER BY claimed_at DESC
     LIMIT 1`,
    [profileUserId]
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, snapshot: row.snapshot, claimedAt: row.claimed_at };
}

/** Test/helper: load guest row by id (never exposes the raw token or its hash). */
export async function getGuestAuraSnapshotMeta(snapshotId: string): Promise<{
  id: string;
  engineVersion: string;
  claimedUserId: string | null;
  expiresAt: string;
  snapshot: AuraSnapshot;
} | null> {
  const { rows } = await query<AuraGuestRow>(
    `SELECT id, snapshot, engine_version, claim_token_hash,
            claimed_user_id, claimed_at::text, created_at::text, expires_at::text
     FROM aura_guest_snapshots WHERE id = $1`,
    [snapshotId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    engineVersion: row.engine_version,
    claimedUserId: row.claimed_user_id,
    expiresAt: row.expires_at,
    snapshot: row.snapshot,
  };
}

export { hashAuraGuestClaimToken };
