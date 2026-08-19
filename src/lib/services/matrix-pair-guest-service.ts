import { createHash, randomBytes } from "crypto";
import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import {
  MATRIX_CALCULATION_VERSION,
  MATRIX_METHODOLOGY_ID,
} from "@/lib/numerology/destiny-matrix";
import {
  buildMatrixCompatFreeSummary,
  matrixCompatSnapshotForPending,
  type MatrixCompatFreeSummary,
} from "@/lib/numerology/matrix-compat-free-summary";
import { MATRIX_PAIR_GUEST_CLAIM_TTL_MS } from "@/lib/matrix-pair-guest-claim-cookie";
import { validateSubjectBirthDate } from "@/lib/services/matrix-subject-service";
import { profileHasBirthData } from "@/lib/users";
import { buildAstroMeta } from "@/lib/astro-profile";
import { getZodiacFromDate } from "@/utils/zodiac";

type PairGuestRow = {
  id: string;
  date_a: string;
  date_b: string;
  name_a: string | null;
  name_b: string | null;
  calculation_version: string;
  compat_snapshot: Record<string, unknown>;
  claim_token_hash: string;
  claimed_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
  expires_at: string;
};

export type MatrixPairGuestSafePayload = {
  pendingId: string;
  dateA: string;
  dateB: string;
  nameA: string | null;
  nameB: string | null;
  calculationVersion: string;
  expiresAt: string;
  preview: MatrixCompatFreeSummary;
};

export type MatrixPairGuestClaimResult =
  | {
      ok: true;
      status: "claimed" | "idempotent";
      pendingId: string;
      dateA: string;
      dateB: string;
      nameA: string | null;
      nameB: string | null;
      score: number;
      calculationVersion: string;
      preview: MatrixCompatFreeSummary;
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

function hashMatrixPairGuestClaimToken(rawToken: string): string {
  return createHash("sha256").update(`matrix-pair-guest-claim:v1:${rawToken}`).digest("hex");
}

export function createMatrixPairGuestClaimToken(): string {
  return randomBytes(24).toString("hex");
}

export { hashMatrixPairGuestClaimToken };

async function sweepExpired(client?: PoolClient): Promise<void> {
  const run = <T extends Record<string, unknown>>(text: string, params?: unknown[]) =>
    client ? queryClient<T>(client, text, params) : query<T>(text, params);
  await run(
    `DELETE FROM matrix_pair_guest_pending
     WHERE claimed_user_id IS NULL AND expires_at < NOW()`
  );
}

function previewFromSnapshot(
  snap: Record<string, unknown>,
  fallback: MatrixCompatFreeSummary | null
): MatrixCompatFreeSummary {
  if (fallback) return fallback;
  const storedVersion =
    typeof snap.version === "string" && snap.version.trim()
      ? snap.version.trim()
      : "";
  return {
    version: storedVersion || "unsupported",
    methodology: "zovus",
    score: typeof snap.score === "number" ? snap.score : 0,
    summary: typeof snap.summary === "string" ? snap.summary : "",
    strengths: Array.isArray(snap.strengths) ? (snap.strengths as string[]) : [],
    tensions: Array.isArray(snap.tensions) ? (snap.tensions as string[]) : [],
    zones: Array.isArray(snap.zones)
      ? (snap.zones as MatrixCompatFreeSummary["zones"])
      : [],
    pairComfort: typeof snap.pairComfort === "number" ? snap.pairComfort : 0,
    pairYear: typeof snap.pairYear === "number" ? snap.pairYear : 0,
  };
}

/**
 * Persist guest pair compatibility (server uses existing matrixCompatibility engine).
 * Free — no rune spend / no paid report entitlement.
 */
export async function createGuestMatrixPairPending(input: {
  dateA: string;
  dateB: string;
  nameA?: string | null;
  nameB?: string | null;
}): Promise<{ rawClaimToken: string; payload: MatrixPairGuestSafePayload }> {
  const dateA = validateSubjectBirthDate(input.dateA);
  const dateB = validateSubjectBirthDate(input.dateB);
  if (!dateA || !dateB) throw new Error("INVALID_BIRTH_DATE");

  const preview = buildMatrixCompatFreeSummary(dateA, dateB);
  if (!preview) throw new Error("INVALID_BIRTH_DATE");

  const rawClaimToken = createMatrixPairGuestClaimToken();
  const claimHash = hashMatrixPairGuestClaimToken(rawClaimToken);
  const expiresAt = new Date(Date.now() + MATRIX_PAIR_GUEST_CLAIM_TTL_MS).toISOString();
  const nameA = input.nameA?.trim().slice(0, 80) || null;
  const nameB = input.nameB?.trim().slice(0, 80) || null;
  const snapshot = matrixCompatSnapshotForPending(preview);

  await sweepExpired();

  const { rows } = await query<{ id: string; expires_at: string }>(
    `INSERT INTO matrix_pair_guest_pending (
       date_a, date_b, name_a, name_b, calculation_version, methodology_id,
       compat_snapshot, claim_token_hash, expires_at
     ) VALUES (
       $1::date, $2::date, $3, $4, $5, $6,
       $7::jsonb, $8, $9::timestamptz
     )
     RETURNING id, expires_at::text`,
    [
      dateA,
      dateB,
      nameA,
      nameB,
      MATRIX_CALCULATION_VERSION,
      MATRIX_METHODOLOGY_ID,
      JSON.stringify(snapshot),
      claimHash,
      expiresAt,
    ]
  );
  const row = rows[0];
  if (!row) throw new Error("MATRIX_PAIR_GUEST_INSERT_FAILED");

  return {
    rawClaimToken,
    payload: {
      pendingId: row.id,
      dateA,
      dateB,
      nameA,
      nameB,
      calculationVersion: MATRIX_CALCULATION_VERSION,
      expiresAt: row.expires_at,
      preview,
    },
  };
}

export async function claimGuestMatrixPairPending(opts: {
  profileUserId: string;
  rawClaimToken: string | null | undefined;
  confirmReplace?: boolean;
}): Promise<MatrixPairGuestClaimResult> {
  const raw = typeof opts.rawClaimToken === "string" ? opts.rawClaimToken.trim() : "";
  if (!raw || !/^[0-9a-f]{48}$/i.test(raw)) {
    return { ok: false, code: "NO_CLAIM_TOKEN" };
  }
  const claimHash = hashMatrixPairGuestClaimToken(raw.toLowerCase());

  return withTransaction(async (client) => {
    await queryClient(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `matrix-pair-guest-claim:${opts.profileUserId}`,
    ]);

    const { rows } = await queryClient<PairGuestRow>(
      client,
      `SELECT id, date_a::text, date_b::text, name_a, name_b, calculation_version,
              compat_snapshot, claim_token_hash,
              claimed_user_id, claimed_at::text,
              created_at::text, expires_at::text
       FROM matrix_pair_guest_pending
       WHERE claim_token_hash = $1
       FOR UPDATE`,
      [claimHash]
    );
    const guest = rows[0];
    if (!guest) {
      await sweepExpired(client);
      return { ok: false, code: "INVALID_TOKEN" };
    }

    const dateA = String(guest.date_a).slice(0, 10);
    const dateB = String(guest.date_b).slice(0, 10);
    const preview = previewFromSnapshot(guest.compat_snapshot, null);

    if (guest.claimed_user_id) {
      if (guest.claimed_user_id === opts.profileUserId) {
        return {
          ok: true,
          status: "idempotent",
          pendingId: guest.id,
          dateA,
          dateB,
          nameA: guest.name_a,
          nameB: guest.name_b,
          score: preview.score,
          calculationVersion: guest.calculation_version,
          preview,
        };
      }
      return { ok: false, code: "ALREADY_CLAIMED" };
    }

    if (new Date(guest.expires_at).getTime() < Date.now()) {
      await queryClient(client, `DELETE FROM matrix_pair_guest_pending WHERE id = $1`, [
        guest.id,
      ]);
      await sweepExpired(client);
      return { ok: false, code: "EXPIRED" };
    }

    const { rows: userRows } = await queryClient<{
      id: string;
      zodiac: string | null;
      birth_date: string | null;
      astro_meta: Record<string, unknown> | null;
    }>(
      client,
      `SELECT id, zodiac, birth_date::text, astro_meta
       FROM users WHERE id = $1 FOR UPDATE`,
      [opts.profileUserId]
    );
    const user = userRows[0];
    if (!user) return { ok: false, code: "NOT_FOUND" };

    const hasBirth = profileHasBirthData(user);
    const existingBirth = user.birth_date ? String(user.birth_date).slice(0, 10) : null;
    const matches = Boolean(existingBirth && existingBirth === dateA);

    if (hasBirth && !matches && !opts.confirmReplace) {
      return {
        ok: false,
        code: "MATRIX_PROFILE_CONFLICT",
        conflict: {
          existingBirthDate: existingBirth,
          guestBirthDate: dateA,
        },
      };
    }

    if (!hasBirth || !matches || opts.confirmReplace) {
      const zodiac = getZodiacFromDate(dateA).name || user.zodiac || "";
      const nextMeta = {
        ...(typeof user.astro_meta === "object" && user.astro_meta ? user.astro_meta : {}),
        ...buildAstroMeta(dateA),
        stubProfile: false,
      };
      await queryClient(
        client,
        `UPDATE users SET
           birth_date = $2::date,
           zodiac = $3,
           astro_meta = $4::jsonb
         WHERE id = $1`,
        [opts.profileUserId, dateA, zodiac, JSON.stringify(nextMeta)]
      );
    }

    // Do not mint paid MATRIX_PAIR_REPORT / rune entitlement — only bind claim.
    await queryClient(
      client,
      `UPDATE matrix_pair_guest_pending
       SET claimed_user_id = $2,
           claimed_at = NOW()
       WHERE id = $1 AND claimed_user_id IS NULL`,
      [guest.id, opts.profileUserId]
    );

    return {
      ok: true,
      status: "claimed",
      pendingId: guest.id,
      dateA,
      dateB,
      nameA: guest.name_a,
      nameB: guest.name_b,
      score: preview.score,
      calculationVersion: guest.calculation_version,
      preview,
    };
  });
}

export async function getMatrixPairGuestPendingMeta(pendingId: string): Promise<{
  id: string;
  dateA: string;
  dateB: string;
  nameA: string | null;
  nameB: string | null;
  calculationVersion: string;
  claimedUserId: string | null;
  claimTokenHash: string;
  compatSnapshot: Record<string, unknown>;
} | null> {
  const { rows } = await query<PairGuestRow>(
    `SELECT id, date_a::text, date_b::text, name_a, name_b, calculation_version,
            compat_snapshot, claim_token_hash,
            claimed_user_id, claimed_at::text,
            created_at::text, expires_at::text
     FROM matrix_pair_guest_pending WHERE id = $1`,
    [pendingId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    dateA: String(row.date_a).slice(0, 10),
    dateB: String(row.date_b).slice(0, 10),
    nameA: row.name_a,
    nameB: row.name_b,
    calculationVersion: row.calculation_version,
    claimedUserId: row.claimed_user_id,
    claimTokenHash: row.claim_token_hash,
    compatSnapshot: row.compat_snapshot,
  };
}
