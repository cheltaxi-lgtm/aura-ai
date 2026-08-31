import { createHash, randomBytes } from "crypto";

import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import {
  AURA_ENGINE_VERSION,
  AURA_GUEST_CLAIM_TTL_MS,
  type AuraColor,
  type AuraSnapshot,
} from "@/lib/aura-constants";
import { isAuraReadingEnabled } from "@/lib/settings";

/** Same portrait re-uploaded within this window returns the stored snapshot. */
const AURA_PHOTO_DEDUP_WINDOW = "30 days";
/** Base color anchor: the aura core is stable for weeks/months per tradition. */
const AURA_BASE_COLOR_WINDOW = "30 days";
/** Product day boundary for «one aura per day» — same IANA zone as daily reminders. */
export const AURA_DAY_TIMEZONE = "Europe/Moscow";
/**
 * Same-session lock across midnight: a shot at 23:50 and 00:10 must keep the core.
 * Calendar-day reuse already blocks a second vision pass before this fires.
 */
export const AURA_CORE_LOCK_MS = 24 * 60 * 60 * 1000;

const AURA_TODAY_PREDICATE = `(created_at AT TIME ZONE '${AURA_DAY_TIMEZONE}')::date = (NOW() AT TIME ZONE '${AURA_DAY_TIMEZONE}')::date`;

export type AuraColorAnchor = {
  color: AuraColor;
  createdAt: Date;
};

export type AuraStoredSnapshot = {
  snapshotId: string;
  snapshot: AuraSnapshot;
  claimedUserId: string | null;
  createdAt: Date;
  expiresAt: string;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function asStored(row: {
  id: string;
  snapshot: AuraSnapshot;
  claimed_user_id: string | null;
  created_at: Date | string;
  expires_at: Date | string;
}): AuraStoredSnapshot | null {
  if (!row.snapshot?.dominantColor) return null;
  return {
    snapshotId: row.id,
    snapshot: row.snapshot,
    claimedUserId: row.claimed_user_id,
    createdAt: asDate(row.created_at),
    expiresAt: asDate(row.expires_at).toISOString(),
  };
}

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

/** Hash of the uploaded image bytes — the photo itself is never stored. */
export function hashAuraPhoto(imageBase64: string): string {
  return createHash("sha256").update(`aura-photo:v1:${imageBase64}`).digest("hex");
}

type AuraStoredRow = {
  id: string;
  snapshot: AuraSnapshot;
  claimed_user_id: string | null;
  created_at: Date | string;
  expires_at: Date | string;
};

function claimTokenHashOf(rawToken: string | null | undefined): string | null {
  const raw = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!raw || !/^[0-9a-f]{48}$/i.test(raw)) return null;
  return hashAuraGuestClaimToken(raw.toLowerCase());
}

export async function findTodaysAuraSnapshotForUser(
  profileUserId: string
): Promise<AuraStoredSnapshot | null> {
  const { rows } = await query<AuraStoredRow>(
    `SELECT id, snapshot, claimed_user_id, created_at, expires_at
     FROM aura_guest_snapshots
     WHERE claimed_user_id = $1
       AND ${AURA_TODAY_PREDICATE}
     ORDER BY created_at DESC
     LIMIT 1`,
    [profileUserId]
  );
  return rows[0] ? asStored(rows[0]) : null;
}

export async function findAuraSnapshotByClaimToken(
  rawToken: string | null | undefined
): Promise<AuraStoredSnapshot | null> {
  const claimHash = claimTokenHashOf(rawToken);
  if (!claimHash) return null;
  const { rows } = await query<AuraStoredRow>(
    `SELECT id, snapshot, claimed_user_id, created_at, expires_at
     FROM aura_guest_snapshots
     WHERE claim_token_hash = $1
     LIMIT 1`,
    [claimHash]
  );
  return rows[0] ? asStored(rows[0]) : null;
}

export async function findTodaysAuraSnapshotByClaimToken(
  rawToken: string | null | undefined
): Promise<AuraStoredSnapshot | null> {
  const stored = await findAuraSnapshotByClaimToken(rawToken);
  if (!stored) return null;
  const moscowToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: AURA_DAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const rowDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: AURA_DAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(stored.createdAt);
  return moscowToday === rowDay ? stored : null;
}

/**
 * Same portrait → same reading, scoped to this person (account or this
 * browser cookie). Never match another user's bytes — a stock photo must
 * not leak someone else's reading.
 */
export async function findScopedSnapshotByPhotoHash(opts: {
  photoHash: string;
  profileUserId?: string | null;
  claimToken?: string | null;
}): Promise<AuraStoredSnapshot | null> {
  const claimHash = claimTokenHashOf(opts.claimToken);
  if (!opts.profileUserId && !claimHash) return null;
  const { rows } = await query<AuraStoredRow>(
    `SELECT id, snapshot, claimed_user_id, created_at, expires_at
     FROM aura_guest_snapshots
     WHERE photo_hash = $1
       AND created_at > NOW() - $2::interval
       AND (
         ($3::uuid IS NOT NULL AND claimed_user_id = $3)
         OR (
           $3::uuid IS NULL
           AND $4::text IS NOT NULL
           AND claim_token_hash = $4
           AND claimed_user_id IS NULL
         )
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [opts.photoHash, AURA_PHOTO_DEDUP_WINDOW, opts.profileUserId ?? null, claimHash]
  );
  return rows[0] ? asStored(rows[0]) : null;
}

/**
 * Stable core anchor: dominant color of the user's latest claimed snapshot.
 * The aura core (dominant color) is stable for weeks/months in the source
 * traditions; layers/chakras carry the day-to-day variance instead.
 */
export async function getAuraBaseColorAnchor(
  profileUserId: string
): Promise<AuraColorAnchor | null> {
  const { rows } = await query<{ snapshot: AuraSnapshot; created_at: Date | string }>(
    `SELECT snapshot, created_at
     FROM aura_guest_snapshots
     WHERE claimed_user_id = $1
       AND created_at > NOW() - $2::interval
     ORDER BY created_at DESC
     LIMIT 1`,
    [profileUserId, AURA_BASE_COLOR_WINDOW]
  );
  const color = rows[0]?.snapshot?.dominantColor;
  if (!color) return null;
  return { color, createdAt: asDate(rows[0].created_at) };
}

export async function getLatestAuraSnapshotForUser(
  profileUserId: string
): Promise<AuraStoredSnapshot | null> {
  const { rows } = await query<AuraStoredRow>(
    `SELECT id, snapshot, claimed_user_id, created_at, expires_at
     FROM aura_guest_snapshots
     WHERE claimed_user_id = $1
       AND created_at > NOW() - $2::interval
     ORDER BY created_at DESC
     LIMIT 1`,
    [profileUserId, AURA_BASE_COLOR_WINDOW]
  );
  return rows[0] ? asStored(rows[0]) : null;
}

/**
 * Guest consecutive shots: the previous teaser in this browser (claim cookie)
 * is the only memory we have before auth.
 */
export async function getAuraColorAnchorFromClaimToken(
  rawToken: string | null | undefined
): Promise<AuraColorAnchor | null> {
  const stored = await findAuraSnapshotByClaimToken(rawToken);
  if (!stored) return null;
  return { color: stored.snapshot.dominantColor, createdAt: stored.createdAt };
}

/** Force the tradition rule: core does not flip within a day. */
export function lockAuraCoreIfRecent(
  snapshot: AuraSnapshot,
  anchor: AuraColorAnchor | null
): AuraSnapshot {
  if (!anchor) return snapshot;
  const ageMs = Date.now() - anchor.createdAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > AURA_CORE_LOCK_MS) return snapshot;
  if (snapshot.dominantColor.key === anchor.color.key) return snapshot;
  return { ...snapshot, dominantColor: { ...anchor.color } };
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
export async function createGuestAuraSnapshot(
  snapshot: AuraSnapshot,
  opts?: { photoHash?: string | null }
): Promise<{
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
       snapshot, engine_version, claim_token_hash, photo_hash, expires_at
     ) VALUES ($1::jsonb, $2, $3, $4, $5::timestamptz)
     RETURNING id, expires_at::text`,
    [JSON.stringify(snapshot), AURA_ENGINE_VERSION, claimHash, opts?.photoHash ?? null, expiresAt]
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
