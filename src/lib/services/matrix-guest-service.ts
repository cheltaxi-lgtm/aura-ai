import { createHash, randomBytes } from "crypto";
import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import {
  destinyMatrix,
  MATRIX_CALCULATION_VERSION,
  matrixToStructuredData,
} from "@/lib/numerology/destiny-matrix";
import { MATRIX_GUEST_CLAIM_TTL_MS } from "@/lib/matrix-guest-claim-cookie";
import { validateSubjectBirthDate } from "@/lib/services/matrix-subject-service";
import { profileHasBirthData } from "@/lib/users";
import { buildAstroMeta } from "@/lib/astro-profile";
import { getZodiacFromDate } from "@/utils/zodiac";

type GuestRow = {
  id: string;
  birth_date: string;
  display_name: string | null;
  as_of_date: string;
  calculation_version: string;
  matrix_snapshot: Record<string, unknown>;
  claim_token_hash: string;
  claimed_user_id: string | null;
  claimed_subject_id: string | null;
  claimed_at: string | null;
  created_at: string;
  expires_at: string;
};

export type MatrixGuestSafePayload = {
  pendingId: string;
  birthDate: string;
  asOfDate: string;
  calculationVersion: string;
  expiresAt: string;
  /** Deterministic personal-zone numbers for continuity proofs (no PII beyond date already known to client). */
  personalNumbers: {
    body: number;
    energy: number;
    roots: number;
    comfort: number;
    karma: number;
    relationships: number;
    money: number;
    talents: number;
  };
};

export type MatrixGuestClaimResult =
  | {
      ok: true;
      status: "claimed" | "idempotent";
      pendingId: string;
      subjectId: string;
      birthDate: string;
      /** Frozen guest calendar day — do not recompute with "now" on first post-auth open. */
      asOfDate: string;
      calculationVersion: string;
    }
  | {
      ok: false;
      code:
        | "NO_CLAIM_TOKEN"
        | "INVALID_TOKEN"
        | "EXPIRED"
        | "ALREADY_CLAIMED"
        | "MATRIX_PROFILE_CONFLICT"
        | "NOT_FOUND";
      conflict?: {
        existingBirthDate: string | null;
        guestBirthDate: string;
      };
    };

/** Claimed guest freeze for a matrix subject (no recompute). */
export type ClaimedGuestMatrixFreeze = {
  pendingId: string;
  birthDate: string;
  asOfDate: string;
  calculationVersion: string;
  matrixSnapshot: Record<string, unknown>;
};

function hashMatrixGuestClaimToken(rawToken: string): string {
  return createHash("sha256").update(`matrix-guest-claim:v1:${rawToken}`).digest("hex");
}

export function createMatrixGuestClaimToken(): string {
  return randomBytes(24).toString("hex");
}

export { hashMatrixGuestClaimToken };

function todayUtcIsoDate(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

async function sweepExpired(client?: PoolClient): Promise<void> {
  const run = <T extends Record<string, unknown>>(text: string, params?: unknown[]) =>
    client ? queryClient<T>(client, text, params) : query<T>(text, params);
  await run(
    `DELETE FROM matrix_guest_pending
     WHERE claimed_user_id IS NULL AND expires_at < NOW()`
  );
}

function personalNumbersFromSnapshot(snapshot: Record<string, unknown>) {
  const num = (key: string) => {
    const p = snapshot[key];
    if (p && typeof p === "object" && typeof (p as { number?: unknown }).number === "number") {
      return (p as { number: number }).number;
    }
    return -1;
  };
  return {
    body: num("body"),
    energy: num("energy"),
    roots: num("roots"),
    comfort: num("comfort"),
    karma: num("karma"),
    relationships: num("relationships"),
    money: num("money"),
    talents: num("talents"),
  };
}

/**
 * Persist guest Matrix identity (server recompute via same destinyMatrix engine).
 * Returns safe payload + raw claim token for HttpOnly cookie.
 */
export async function createGuestMatrixPending(input: {
  birthDate: string;
  displayName?: string | null;
}): Promise<{ rawClaimToken: string; payload: MatrixGuestSafePayload }> {
  const birthDate = validateSubjectBirthDate(input.birthDate);
  if (!birthDate) throw new Error("INVALID_BIRTH_DATE");

  const asOfDate = todayUtcIsoDate();
  const matrix = destinyMatrix(birthDate, { asOfDate });
  if (!matrix) throw new Error("INVALID_BIRTH_DATE");

  const snapshot = matrixToStructuredData(matrix);
  const rawClaimToken = createMatrixGuestClaimToken();
  const claimHash = hashMatrixGuestClaimToken(rawClaimToken);
  const expiresAt = new Date(Date.now() + MATRIX_GUEST_CLAIM_TTL_MS).toISOString();
  const displayName = input.displayName?.trim().slice(0, 80) || null;

  await sweepExpired();

  const { rows } = await query<{ id: string; expires_at: string }>(
    `INSERT INTO matrix_guest_pending (
       birth_date, display_name, as_of_date, calculation_version,
       matrix_snapshot, claim_token_hash, expires_at
     ) VALUES (
       $1::date, $2, $3::date, $4,
       $5::jsonb, $6, $7::timestamptz
     )
     RETURNING id, expires_at::text`,
    [
      birthDate,
      displayName,
      asOfDate,
      MATRIX_CALCULATION_VERSION,
      JSON.stringify(snapshot),
      claimHash,
      expiresAt,
    ]
  );
  const row = rows[0];
  if (!row) throw new Error("MATRIX_GUEST_INSERT_FAILED");

  return {
    rawClaimToken,
    payload: {
      pendingId: row.id,
      birthDate,
      asOfDate,
      calculationVersion: MATRIX_CALCULATION_VERSION,
      expiresAt: row.expires_at,
      personalNumbers: personalNumbersFromSnapshot(snapshot),
    },
  };
}

async function adoptSelfSubject(
  client: PoolClient,
  userId: string,
  birthDate: string,
  displayName: string | null
): Promise<string> {
  const existing = await queryClient<{ id: string; birth_date: string }>(
    client,
    `SELECT id, birth_date::text FROM matrix_subjects
     WHERE user_id = $1 AND kind = 'self'
     LIMIT 1
     FOR UPDATE`,
    [userId]
  );
  if (existing.rows[0]) {
    const { rows } = await queryClient<{ id: string }>(
      client,
      `UPDATE matrix_subjects
       SET birth_date = $3::date,
           display_name = COALESCE($4, display_name),
           updated_at = NOW()
       WHERE user_id = $1 AND id = $2::uuid AND kind = 'self'
       RETURNING id`,
      [userId, existing.rows[0].id, birthDate, displayName]
    );
    if (!rows[0]) throw new Error("SUBJECT_UPDATE_FAILED");
    return rows[0].id;
  }

  const { rows } = await queryClient<{ id: string }>(
    client,
    `INSERT INTO matrix_subjects (user_id, kind, display_name, birth_date)
     VALUES ($1, 'self', $2, $3::date)
     RETURNING id`,
    [userId, displayName, birthDate]
  );
  if (!rows[0]) throw new Error("SUBJECT_INSERT_FAILED");
  return rows[0].id;
}

export async function claimGuestMatrixPending(opts: {
  profileUserId: string;
  rawClaimToken: string | null | undefined;
  confirmReplace?: boolean;
}): Promise<MatrixGuestClaimResult> {
  const raw = typeof opts.rawClaimToken === "string" ? opts.rawClaimToken.trim() : "";
  if (!raw || !/^[0-9a-f]{48}$/i.test(raw)) {
    return { ok: false, code: "NO_CLAIM_TOKEN" };
  }
  const claimHash = hashMatrixGuestClaimToken(raw.toLowerCase());

  return withTransaction(async (client) => {
    await queryClient(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `matrix-guest-claim:${opts.profileUserId}`,
    ]);

    const { rows } = await queryClient<GuestRow>(
      client,
      `SELECT id, birth_date::text, display_name, as_of_date::text, calculation_version,
              matrix_snapshot, claim_token_hash,
              claimed_user_id, claimed_subject_id, claimed_at::text,
              created_at::text, expires_at::text
       FROM matrix_guest_pending
       WHERE claim_token_hash = $1
       FOR UPDATE`,
      [claimHash]
    );
    const guest = rows[0];
    if (!guest) {
      await sweepExpired(client);
      return { ok: false, code: "INVALID_TOKEN" };
    }

    if (guest.claimed_user_id) {
      if (guest.claimed_user_id === opts.profileUserId && guest.claimed_subject_id) {
        return {
          ok: true,
          status: "idempotent",
          pendingId: guest.id,
          subjectId: guest.claimed_subject_id,
          birthDate: String(guest.birth_date).slice(0, 10),
          asOfDate: String(guest.as_of_date).slice(0, 10),
          calculationVersion: guest.calculation_version,
        };
      }
      return { ok: false, code: "ALREADY_CLAIMED" };
    }

    if (new Date(guest.expires_at).getTime() < Date.now()) {
      await queryClient(client, `DELETE FROM matrix_guest_pending WHERE id = $1`, [guest.id]);
      await sweepExpired(client);
      return { ok: false, code: "EXPIRED" };
    }

    const { rows: userRows } = await queryClient<{
      id: string;
      name: string;
      gender: string;
      birth_date: string | null;
      zodiac: string | null;
      birth_time: string | null;
      birth_city: string | null;
      life_focus: string | null;
      main_question: string | null;
      astro_meta: Record<string, unknown> | null;
    }>(
      client,
      `SELECT id, name, gender, birth_date::text, zodiac, birth_time::text, birth_city,
              life_focus, main_question, astro_meta
       FROM users WHERE id = $1 FOR UPDATE`,
      [opts.profileUserId]
    );
    const user = userRows[0];
    if (!user) return { ok: false, code: "NOT_FOUND" };

    const guestBirth = String(guest.birth_date).slice(0, 10);
    const hasBirth = profileHasBirthData(user);
    const existingBirth = user.birth_date ? String(user.birth_date).slice(0, 10) : null;
    const matches = Boolean(existingBirth && existingBirth === guestBirth);

    if (hasBirth && !matches && !opts.confirmReplace) {
      return {
        ok: false,
        code: "MATRIX_PROFILE_CONFLICT",
        conflict: {
          existingBirthDate: existingBirth,
          guestBirthDate: guestBirth,
        },
      };
    }

    if (!hasBirth || !matches || opts.confirmReplace) {
      const zodiac = getZodiacFromDate(guestBirth).name || user.zodiac || "";
      const nextMeta = {
        ...(typeof user.astro_meta === "object" && user.astro_meta ? user.astro_meta : {}),
        ...buildAstroMeta(guestBirth),
        stubProfile: false,
      };
      await queryClient(
        client,
        `UPDATE users SET
           birth_date = $2::date,
           zodiac = $3,
           astro_meta = $4::jsonb
         WHERE id = $1`,
        [opts.profileUserId, guestBirth, zodiac, JSON.stringify(nextMeta)]
      );
    }

    const subjectId = await adoptSelfSubject(
      client,
      opts.profileUserId,
      guestBirth,
      guest.display_name
    );

    await queryClient(
      client,
      `UPDATE matrix_guest_pending
       SET claimed_user_id = $2,
           claimed_subject_id = $3::uuid,
           claimed_at = NOW()
       WHERE id = $1 AND claimed_user_id IS NULL`,
      [guest.id, opts.profileUserId, subjectId]
    );

    return {
      ok: true,
      status: "claimed",
      pendingId: guest.id,
      subjectId,
      birthDate: guestBirth,
      // Snapshot already frozen at guest persist — never recompute here.
      asOfDate: String(guest.as_of_date).slice(0, 10),
      calculationVersion: guest.calculation_version,
    };
  });
}

/**
 * Server-authoritative freeze for first post-auth Matrix open.
 * Looks up claimed pending by subject — does not recompute matrix_snapshot.
 */
export async function getClaimedGuestMatrixFreeze(
  profileUserId: string,
  subjectId: string
): Promise<ClaimedGuestMatrixFreeze | null> {
  const sid = subjectId?.trim();
  if (!sid || !/^[0-9a-f-]{36}$/i.test(sid)) return null;
  const { rows } = await query<GuestRow>(
    `SELECT id, birth_date::text, display_name, as_of_date::text, calculation_version,
            matrix_snapshot, claim_token_hash,
            claimed_user_id, claimed_subject_id, claimed_at::text,
            created_at::text, expires_at::text
     FROM matrix_guest_pending
     WHERE claimed_user_id = $1
       AND claimed_subject_id = $2::uuid
     ORDER BY claimed_at DESC NULLS LAST
     LIMIT 1`,
    [profileUserId, sid]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    pendingId: row.id,
    birthDate: String(row.birth_date).slice(0, 10),
    asOfDate: String(row.as_of_date).slice(0, 10),
    calculationVersion: row.calculation_version,
    matrixSnapshot: row.matrix_snapshot,
  };
}

export async function getMatrixGuestPendingMeta(pendingId: string): Promise<{
  id: string;
  birthDate: string;
  asOfDate: string;
  calculationVersion: string;
  claimedUserId: string | null;
  claimedSubjectId: string | null;
  claimTokenHash: string;
  matrixSnapshot: Record<string, unknown>;
} | null> {
  const { rows } = await query<GuestRow>(
    `SELECT id, birth_date::text, display_name, as_of_date::text, calculation_version,
            matrix_snapshot, claim_token_hash,
            claimed_user_id, claimed_subject_id, claimed_at::text,
            created_at::text, expires_at::text
     FROM matrix_guest_pending WHERE id = $1`,
    [pendingId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    birthDate: String(row.birth_date).slice(0, 10),
    asOfDate: String(row.as_of_date).slice(0, 10),
    calculationVersion: row.calculation_version,
    claimedUserId: row.claimed_user_id,
    claimedSubjectId: row.claimed_subject_id,
    claimTokenHash: row.claim_token_hash,
    matrixSnapshot: row.matrix_snapshot,
  };
}
