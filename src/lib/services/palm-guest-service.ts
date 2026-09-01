import { createHash, randomBytes } from "crypto";

import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import {
  PALM_ENGINE_VERSION,
  PALM_GUEST_CLAIM_TTL_MS,
  alignPalmSnapshot,
  type PalmHandShape,
  type PalmSnapshot,
} from "@/lib/palm-constants";
import { isPalmReadingEnabled } from "@/lib/settings";

const PALM_PHOTO_DEDUP_WINDOW = "30 days";
const PALM_CORE_WINDOW = "30 days";
export const PALM_DAY_TIMEZONE = "Europe/Moscow";
export const PALM_CORE_LOCK_MS = 30 * 24 * 60 * 60 * 1000;

const PALM_TODAY_PREDICATE = `(created_at AT TIME ZONE '${PALM_DAY_TIMEZONE}')::date = (NOW() AT TIME ZONE '${PALM_DAY_TIMEZONE}')::date`;

export type PalmCoreAnchor = {
  handShape: PalmHandShape;
  createdAt: Date;
};

export type PalmStoredSnapshot = {
  snapshotId: string;
  snapshot: PalmSnapshot;
  claimedUserId: string | null;
  createdAt: Date;
  expiresAt: string;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function asStored(row: {
  id: string;
  snapshot: PalmSnapshot;
  claimed_user_id: string | null;
  created_at: Date | string;
  expires_at: Date | string;
}): PalmStoredSnapshot | null {
  if (!row.snapshot?.handDetected) return null;
  return {
    snapshotId: row.id,
    snapshot: alignPalmSnapshot(row.snapshot),
    claimedUserId: row.claimed_user_id,
    createdAt: asDate(row.created_at),
    expiresAt: asDate(row.expires_at).toISOString(),
  };
}

export type PalmGuestRow = {
  id: string;
  snapshot: PalmSnapshot;
  engine_version: string;
  claim_token_hash: string;
  claimed_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
  expires_at: string;
};

export type PalmGuestClaimResult =
  | {
      ok: true;
      status: "claimed" | "idempotent";
      snapshotId: string;
      snapshot: PalmSnapshot;
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

function hashPalmGuestClaimToken(rawToken: string): string {
  return createHash("sha256").update(`palm-guest-claim:v1:${rawToken}`).digest("hex");
}

export function createPalmGuestClaimToken(): string {
  return randomBytes(24).toString("hex");
}

/** Hash of the uploaded image bytes — the photo itself is never stored. */
export function hashPalmPhoto(imageBase64: string): string {
  return createHash("sha256").update(`palm-photo:v1:${imageBase64}`).digest("hex");
}

type PalmStoredRow = {
  id: string;
  snapshot: PalmSnapshot;
  claimed_user_id: string | null;
  created_at: Date | string;
  expires_at: Date | string;
};

const SNAPSHOT_COLS = `id, snapshot, claimed_user_id, created_at, expires_at`;

function claimTokenHashOf(rawToken: string | null | undefined): string | null {
  const raw = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!raw || !/^[0-9a-f]{48}$/i.test(raw)) return null;
  return hashPalmGuestClaimToken(raw.toLowerCase());
}

export async function findTodaysPalmSnapshotForUser(
  profileUserId: string
): Promise<PalmStoredSnapshot | null> {
  const { rows } = await query<PalmStoredRow>(
    `SELECT ${SNAPSHOT_COLS}
     FROM palm_guest_snapshots
     WHERE claimed_user_id = $1
       AND ${PALM_TODAY_PREDICATE}
     ORDER BY created_at DESC
     LIMIT 1`,
    [profileUserId]
  );
  return rows[0] ? asStored(rows[0]) : null;
}

export async function findPalmSnapshotByClaimToken(
  rawToken: string | null | undefined
): Promise<PalmStoredSnapshot | null> {
  const claimHash = claimTokenHashOf(rawToken);
  if (!claimHash) return null;
  const { rows } = await query<PalmStoredRow>(
    `SELECT ${SNAPSHOT_COLS}
     FROM palm_guest_snapshots
     WHERE claim_token_hash = $1
     LIMIT 1`,
    [claimHash]
  );
  return rows[0] ? asStored(rows[0]) : null;
}

export async function findTodaysPalmSnapshotByClaimToken(
  rawToken: string | null | undefined
): Promise<PalmStoredSnapshot | null> {
  const stored = await findPalmSnapshotByClaimToken(rawToken);
  if (!stored) return null;
  const moscowToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: PALM_DAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const rowDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: PALM_DAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(stored.createdAt);
  return moscowToday === rowDay ? stored : null;
}

export async function findScopedPalmSnapshotByPhotoHash(opts: {
  photoHash: string;
  profileUserId?: string | null;
  claimToken?: string | null;
}): Promise<PalmStoredSnapshot | null> {
  const claimHash = claimTokenHashOf(opts.claimToken);
  if (!opts.profileUserId && !claimHash) return null;
  const { rows } = await query<PalmStoredRow>(
    `SELECT ${SNAPSHOT_COLS}
     FROM palm_guest_snapshots
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
    [opts.photoHash, PALM_PHOTO_DEDUP_WINDOW, opts.profileUserId ?? null, claimHash]
  );
  return rows[0] ? asStored(rows[0]) : null;
}

export async function getPalmCoreAnchor(
  profileUserId: string
): Promise<PalmCoreAnchor | null> {
  const { rows } = await query<{ snapshot: PalmSnapshot; created_at: Date | string }>(
    `SELECT snapshot, created_at
     FROM palm_guest_snapshots
     WHERE claimed_user_id = $1
       AND created_at > NOW() - $2::interval
     ORDER BY created_at DESC
     LIMIT 1`,
    [profileUserId, PALM_CORE_WINDOW]
  );
  const shape = rows[0]?.snapshot?.handShape;
  if (!shape) return null;
  return { handShape: shape, createdAt: asDate(rows[0].created_at) };
}

export async function getLatestPalmSnapshotForUser(
  profileUserId: string
): Promise<PalmStoredSnapshot | null> {
  const { rows } = await query<PalmStoredRow>(
    `SELECT ${SNAPSHOT_COLS}
     FROM palm_guest_snapshots
     WHERE claimed_user_id = $1
       AND created_at > NOW() - $2::interval
     ORDER BY created_at DESC
     LIMIT 1`,
    [profileUserId, PALM_CORE_WINDOW]
  );
  return rows[0] ? asStored(rows[0]) : null;
}

export async function getPalmCoreAnchorFromClaimToken(
  rawToken: string | null | undefined
): Promise<PalmCoreAnchor | null> {
  const stored = await findPalmSnapshotByClaimToken(rawToken);
  if (!stored) return null;
  return { handShape: stored.snapshot.handShape, createdAt: stored.createdAt };
}

/** Force the tradition rule: hand type does not flip within the lock window. */
export function lockPalmCoreIfRecent(
  snapshot: PalmSnapshot,
  anchor: PalmCoreAnchor | null
): PalmSnapshot {
  if (!anchor) return snapshot;
  const ageMs = Date.now() - anchor.createdAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > PALM_CORE_LOCK_MS) return snapshot;
  if (snapshot.handShape === anchor.handShape) return snapshot;
  return alignPalmSnapshot({
    ...snapshot,
    handShape: anchor.handShape,
  });
}

async function sweepExpiredGuestSnapshots(client?: PoolClient): Promise<number> {
  const run = <T extends Record<string, unknown>>(text: string, params?: unknown[]) =>
    client ? queryClient<T>(client, text, params) : query<T>(text, params);
  const { rowCount } = await run(
    `DELETE FROM palm_guest_snapshots
     WHERE claimed_user_id IS NULL AND expires_at < NOW()`
  );
  return rowCount ?? 0;
}

export async function createGuestPalmSnapshot(
  snapshot: PalmSnapshot,
  opts?: { photoHash?: string | null }
): Promise<{
  rawClaimToken: string;
  snapshotId: string;
  expiresAt: string;
}> {
  if (!(await isPalmReadingEnabled())) {
    throw new Error("PALM_DISABLED");
  }

  await sweepExpiredGuestSnapshots();

  const rawClaimToken = createPalmGuestClaimToken();
  const claimHash = hashPalmGuestClaimToken(rawClaimToken);
  const expiresAt = new Date(Date.now() + PALM_GUEST_CLAIM_TTL_MS).toISOString();
  const aligned = alignPalmSnapshot(snapshot);

  const { rows } = await query<{ id: string; expires_at: string }>(
    `INSERT INTO palm_guest_snapshots (
       snapshot, engine_version, claim_token_hash, photo_hash, expires_at
     ) VALUES ($1::jsonb, $2, $3, $4, $5::timestamptz)
     RETURNING id, expires_at::text`,
    [JSON.stringify(aligned), PALM_ENGINE_VERSION, claimHash, opts?.photoHash ?? null, expiresAt]
  );

  const row = rows[0];
  if (!row) throw new Error("GUEST_PALM_INSERT_FAILED");

  return { rawClaimToken, snapshotId: row.id, expiresAt: row.expires_at };
}

export async function claimGuestPalmSnapshot(opts: {
  profileUserId: string;
  rawClaimToken: string | null | undefined;
}): Promise<PalmGuestClaimResult> {
  if (!(await isPalmReadingEnabled())) {
    return { ok: false, code: "DISABLED" };
  }

  const raw = typeof opts.rawClaimToken === "string" ? opts.rawClaimToken.trim() : "";
  if (!raw || !/^[0-9a-f]{48}$/i.test(raw)) {
    return { ok: false, code: "NO_CLAIM_TOKEN" };
  }

  const claimHash = hashPalmGuestClaimToken(raw.toLowerCase());

  return withTransaction(async (client) => {
    await queryClient(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `palm-guest-claim:${opts.profileUserId}`,
    ]);

    const { rows } = await queryClient<PalmGuestRow>(
      client,
      `SELECT id, snapshot, engine_version, claim_token_hash,
              claimed_user_id, claimed_at::text, created_at::text, expires_at::text
       FROM palm_guest_snapshots
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
          snapshot: alignPalmSnapshot(guest.snapshot),
        };
      }
      return { ok: false, code: "ALREADY_CLAIMED" };
    }

    if (new Date(guest.expires_at).getTime() < Date.now()) {
      await queryClient(client, `DELETE FROM palm_guest_snapshots WHERE id = $1`, [guest.id]);
      await sweepExpiredGuestSnapshots(client);
      return { ok: false, code: "EXPIRED" };
    }

    const { rowCount } = await queryClient(
      client,
      `UPDATE palm_guest_snapshots
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
      snapshot: alignPalmSnapshot(guest.snapshot),
    };
  });
}

export async function getClaimedPalmSnapshot(opts: {
  snapshotId: string;
  profileUserId: string;
}): Promise<PalmSnapshot | null> {
  const row = await getClaimedPalmSnapshotRow(opts);
  return row?.snapshot ?? null;
}

export async function getClaimedPalmSnapshotRow(opts: {
  snapshotId: string;
  profileUserId: string;
}): Promise<PalmStoredSnapshot | null> {
  const { rows } = await query<PalmStoredRow>(
    `SELECT ${SNAPSHOT_COLS}
     FROM palm_guest_snapshots
     WHERE id = $1 AND claimed_user_id = $2`,
    [opts.snapshotId, opts.profileUserId]
  );
  return rows[0] ? asStored(rows[0]) : null;
}

export { hashPalmGuestClaimToken };
