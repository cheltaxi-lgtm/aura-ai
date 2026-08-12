import {
  buildGuestResumeCardsPayload,
  cardNamesFromGuestPayload,
  GUEST_RESUME_SPREAD_ID,
  GUEST_RESUME_SPREAD_TYPE,
  GUEST_RESUME_TTL_MS,
  hashGuestResumeToken,
  parseGuestResumeCardsPayload,
  type GuestResumeCardsPayload,
  type GuestResumeStatus,
  type GuestResumeSymbol,
} from "@/lib/guest-triplet-receipt";
import type { DeckSystem } from "@/lib/decks/types";
import {
  profileHasGuestIntroLifetimeFlag,
  recordGuestIntroUsed,
} from "@/lib/rate-limit-anchors";
import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";
import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";

export type GuestResumeSessionRow = {
  id: string;
  user_id: string | null;
  character_key: string | null;
  spread_type: string | null;
  spread_id: string | null;
  cards: unknown;
  guest_resume_token_hash: string | null;
  guest_resume_expires_at: Date | null;
  guest_resume_status: GuestResumeStatus | null;
  guest_resume_fingerprint: string | null;
  guest_resume_reading_id: string | null;
  guest_resume_claimed_at: Date | null;
  [key: string]: unknown;
};

const RESUME_SELECT = `
  id, user_id, character_key, spread_type, spread_id, cards, created_at,
  guest_resume_token_hash, guest_resume_expires_at, guest_resume_status,
  guest_resume_fingerprint, guest_resume_reading_id, guest_resume_claimed_at
`;

export async function createIssuedGuestResumeSession(input: {
  masterId: string;
  system: DeckSystem;
  spreadId: string;
  question: string;
  symbols: GuestResumeSymbol[];
  fingerprint: string;
  tokenHash: string;
}): Promise<GuestResumeSessionRow> {
  const payload = buildGuestResumeCardsPayload({
    question: input.question,
    system: input.system,
    symbols: input.symbols,
  });
  const expiresAt = new Date(Date.now() + GUEST_RESUME_TTL_MS);

  const { rows } = await query<GuestResumeSessionRow>(
    `INSERT INTO sessions (
       character_key, spread_type, spread_id, cards,
       guest_resume_token_hash, guest_resume_expires_at, guest_resume_status,
       guest_resume_fingerprint, status
     ) VALUES (
       $1, $2, $3, $4::jsonb,
       $5, $6, 'issued',
       $7, 'active'
     )
     RETURNING ${RESUME_SELECT}`,
    [
      input.masterId,
      GUEST_RESUME_SPREAD_TYPE,
      input.spreadId || GUEST_RESUME_SPREAD_ID,
      JSON.stringify(payload),
      input.tokenHash,
      expiresAt.toISOString(),
      input.fingerprint,
    ]
  );
  return rows[0];
}

export async function findGuestResumeByTokenHash(
  tokenHash: string,
  client?: PoolClient
): Promise<GuestResumeSessionRow | null> {
  const run = client
    ? <T extends import("pg").QueryResultRow>(text: string, params?: unknown[]) =>
        queryClient(client, text, params)
    : query;
  const { rows } = await run<GuestResumeSessionRow>(
    `SELECT ${RESUME_SELECT}
     FROM sessions
     WHERE guest_resume_token_hash = $1
     LIMIT 1`,
    [tokenHash]
  );
  return (rows[0] as GuestResumeSessionRow | undefined) ?? null;
}

export async function getGuestResumeSessionById(
  sessionId: string
): Promise<GuestResumeSessionRow | null> {
  const { rows } = await query<GuestResumeSessionRow>(
    `SELECT ${RESUME_SELECT}
     FROM sessions
     WHERE id = $1
       AND guest_resume_status IS NOT NULL
     LIMIT 1`,
    [sessionId]
  );
  return rows[0] ?? null;
}

/** Latest claimed/consumed guest resume for this profile (cookie-loss recovery). */
export async function findLatestOwnedGuestResume(
  profileUserId: string
): Promise<GuestResumeSessionRow | null> {
  const { rows } = await query<GuestResumeSessionRow>(
    `SELECT ${RESUME_SELECT}
     FROM sessions
     WHERE user_id = $1
       AND guest_resume_status IN ('claimed', 'reading_consumed')
     ORDER BY COALESCE(guest_resume_claimed_at, updated_at, created_at) DESC
     LIMIT 1`,
    [profileUserId]
  );
  return rows[0] ?? null;
}

export async function expireIssuedGuestResumeIfNeeded(
  row: GuestResumeSessionRow
): Promise<GuestResumeSessionRow> {
  if (
    row.guest_resume_status === "issued" &&
    row.guest_resume_expires_at &&
    new Date(row.guest_resume_expires_at).getTime() <= Date.now()
  ) {
    const { rows } = await query<GuestResumeSessionRow>(
      `UPDATE sessions
       SET guest_resume_status = 'expired', updated_at = NOW()
       WHERE id = $1 AND guest_resume_status = 'issued'
       RETURNING ${RESUME_SELECT}`,
      [row.id]
    );
    return rows[0] ?? { ...row, guest_resume_status: "expired" };
  }
  return row;
}

export type ClaimGuestResumeResult =
  | { ok: true; sessionId: string; alreadyClaimed: boolean; payload: GuestResumeCardsPayload; masterId: string; fingerprint: string }
  | { ok: false; code: "unavailable" | "already_used" };

/** True if this profile already claimed/consumed a landing guest free reading. */
export async function profileHasUsedGuestResume(
  profileUserId: string,
  options?: { exceptSessionId?: string; client?: PoolClient }
): Promise<boolean> {
  // Durable lifetime flag survives history/cabinet purge (sessions may be gone).
  if (await profileHasGuestIntroLifetimeFlag(profileUserId, options?.client)) {
    return true;
  }

  const run = options?.client
    ? <T extends import("pg").QueryResultRow>(text: string, params?: unknown[]) =>
        queryClient(options.client!, text, params)
    : query;
  const except = options?.exceptSessionId?.trim();
  const { rows } = except
    ? await run<{ id: string }>(
        `SELECT id FROM sessions
         WHERE user_id = $1
           AND guest_resume_status IN ('claimed', 'reading_consumed')
           AND id <> $2
         LIMIT 1`,
        [profileUserId, except]
      )
    : await run<{ id: string }>(
        `SELECT id FROM sessions
         WHERE user_id = $1
           AND guest_resume_status IN ('claimed', 'reading_consumed')
         LIMIT 1`,
        [profileUserId]
      );
  return Boolean(rows[0]);
}

/**
 * Atomic claim: issued → claimed for authenticated profile user.
 * Same user retry returns existing. Other user / missing → unavailable (no leak).
 * One landing free reading per profile — logout + new guest draw cannot mint another.
 */
export async function claimGuestResumeSession(input: {
  token: string;
  profileUserId: string;
  /**
   * Optional defense-in-depth: session-claim cookie matched this receipt.
   * Not required — HttpOnly guest resume cookie is sufficient. OAuth/login
   * often overwrites aura_session_claim with a fresh /api/session id.
   */
  bindingOk?: boolean;
}): Promise<ClaimGuestResumeResult> {
  if (!input.token) {
    return { ok: false, code: "unavailable" };
  }

  const tokenHash = hashGuestResumeToken(input.token);

  return withTransaction(async (client) => {
    // Lock user first so two parallel claims of different receipts cannot both succeed.
    await queryClient(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `guest-resume-user:${input.profileUserId}`,
    ]);
    await queryClient(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `guest-resume-claim:${tokenHash}`,
    ]);

    const found = await findGuestResumeByTokenHash(tokenHash, client);
    if (!found) {
      return { ok: false, code: "unavailable" };
    }

    let row = found;
    if (
      row.guest_resume_status === "issued" &&
      row.guest_resume_expires_at &&
      new Date(row.guest_resume_expires_at).getTime() <= Date.now()
    ) {
      await queryClient(
        client,
        `UPDATE sessions SET guest_resume_status = 'expired', updated_at = NOW()
         WHERE id = $1 AND guest_resume_status = 'issued'`,
        [row.id]
      );
      return { ok: false, code: "unavailable" };
    }

    const payload = parseGuestResumeCardsPayload(row.cards);
    if (!payload || !row.guest_resume_fingerprint) {
      return { ok: false, code: "unavailable" };
    }

    if (row.guest_resume_status === "claimed" || row.guest_resume_status === "reading_consumed") {
      if (row.user_id === input.profileUserId) {
        return {
          ok: true,
          sessionId: row.id,
          alreadyClaimed: true,
          payload,
          masterId: row.character_key || GUEST_TRIPLET_MASTER_ID,
          fingerprint: row.guest_resume_fingerprint,
        };
      }
      return { ok: false, code: "unavailable" };
    }

    if (row.guest_resume_status !== "issued" || row.user_id) {
      return { ok: false, code: "unavailable" };
    }

    if (
      await profileHasUsedGuestResume(input.profileUserId, {
        exceptSessionId: row.id,
        client,
      })
    ) {
      return { ok: false, code: "already_used" };
    }

    const { rows } = await queryClient<GuestResumeSessionRow>(
      client,
      `UPDATE sessions
       SET user_id = $2,
           guest_resume_status = 'claimed',
           guest_resume_claimed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
         AND guest_resume_status = 'issued'
         AND user_id IS NULL
       RETURNING ${RESUME_SELECT}`,
      [row.id, input.profileUserId]
    );

    const claimed = rows[0];
    if (!claimed) {
      // Race: re-read
      const again = await findGuestResumeByTokenHash(tokenHash, client);
      if (
        again &&
        (again.guest_resume_status === "claimed" ||
          again.guest_resume_status === "reading_consumed") &&
        again.user_id === input.profileUserId
      ) {
        const p = parseGuestResumeCardsPayload(again.cards);
        if (p && again.guest_resume_fingerprint) {
          return {
            ok: true,
            sessionId: again.id,
            alreadyClaimed: true,
            payload: p,
            masterId: again.character_key || GUEST_TRIPLET_MASTER_ID,
            fingerprint: again.guest_resume_fingerprint,
          };
        }
      }
      return { ok: false, code: "unavailable" };
    }

    // Lifetime acquisition marker — independent of daily triplet cooldown.
    try {
      await recordGuestIntroUsed(input.profileUserId, new Date(), client);
    } catch {
      /* non-fatal: session row still gates until purge */
    }

    return {
      ok: true,
      sessionId: claimed.id,
      alreadyClaimed: false,
      payload,
      masterId: claimed.character_key || GUEST_TRIPLET_MASTER_ID,
      fingerprint: claimed.guest_resume_fingerprint!,
    };
  });
}

export async function setGuestResumeReadingId(
  sessionId: string,
  profileUserId: string,
  historyId: string
): Promise<void> {
  await query(
    `UPDATE sessions
     SET guest_resume_reading_id = $3,
         guest_resume_status = 'reading_consumed',
         updated_at = NOW()
     WHERE id = $1
       AND user_id = $2
       AND guest_resume_status IN ('claimed', 'reading_consumed')`,
    [sessionId, profileUserId, historyId]
  );
}

export async function expireUnclaimedGuestResumes(limit = 100): Promise<number> {
  const result = await query(
    `UPDATE sessions
     SET guest_resume_status = 'expired', updated_at = NOW()
     WHERE id IN (
       SELECT id FROM sessions
       WHERE guest_resume_status = 'issued'
         AND user_id IS NULL
         AND guest_resume_expires_at IS NOT NULL
         AND guest_resume_expires_at <= NOW()
       LIMIT $1
     )`,
    [limit]
  );
  return result.rowCount ?? 0;
}

export function guestResumeDisplayCards(payload: GuestResumeCardsPayload): string[] {
  return cardNamesFromGuestPayload(payload);
}

/** Persist teaser / attempt flags into sessions.cards JSON (no migration). */
export async function updateGuestResumeCardsPayload(
  sessionId: string,
  payload: GuestResumeCardsPayload
): Promise<void> {
  await query(
    `UPDATE sessions
     SET cards = $2::jsonb, updated_at = NOW()
     WHERE id = $1
       AND guest_resume_status IS NOT NULL`,
    [sessionId, JSON.stringify(payload)]
  );
}

/** Cross-receipt teaser reuse by cacheKey stored inside cards.teaser. */
export async function findGuestResumeTeaserByCacheKey(
  cacheKey: string
): Promise<import("@/lib/guest-triplet-receipt-shared").GuestResumeTeaserRecord | null> {
  if (!cacheKey.trim()) return null;
  const { rows } = await query<{ cards: unknown }>(
    `SELECT cards
     FROM sessions
     WHERE guest_resume_status IS NOT NULL
       AND cards->'teaser'->>'cacheKey' = $1
       AND COALESCE(cards->'teaser'->>'text', '') <> ''
     ORDER BY COALESCE(guest_resume_claimed_at, updated_at, created_at) DESC
     LIMIT 1`,
    [cacheKey]
  );
  const payload = parseGuestResumeCardsPayload(rows[0]?.cards);
  return payload?.teaser ?? null;
}
