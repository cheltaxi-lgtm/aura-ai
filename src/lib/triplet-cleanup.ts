import { query } from "./db";
import { recordTripletDrawAnchor } from "./users";
import { tarotCardsKey } from "./tarot";

export type TripletReadingRow = {
  characterName: string;
  createdAt?: string;
  contextData?: {
    type?: string;
    tarotCards?: { name: string }[];
    masterId?: string;
  };
};

function parseSessionCardNames(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim());
  }
  return [];
}

/** Keep 24h cooldown when triplet rows are removed from display/history. */
async function preserveTripletDrawAnchor(userId: string): Promise<void> {
  const { rows } = await query<{ max_at: Date | null }>(
    `SELECT MAX(created_at) AS max_at FROM history
     WHERE user_id = $1
       AND (
         character_name = 'triplet'
         OR context_data->>'type' = 'triplet'
       )`,
    [userId]
  );
  const maxAt = rows[0]?.max_at;
  if (maxAt) {
    await recordTripletDrawAnchor(userId, maxAt);
  }
}

/** Remove all daily triplet rows from user history. */
export async function deleteAllUserTripletHistory(userId: string): Promise<number> {
  await preserveTripletDrawAnchor(userId);
  const result = await query(
    `DELETE FROM history WHERE user_id = $1 AND character_name = 'triplet'`,
    [userId]
  );
  return result.rowCount ?? 0;
}

export async function userHasConsultationActivity(userId: string): Promise<boolean> {
  const { rows: mem } = await query(
    `SELECT 1 FROM session_memories WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (mem.length) return true;

  const { rows: sess } = await query(
    `SELECT 1 FROM sessions
     WHERE user_id = $1
       AND character_key IS NOT NULL
       AND TRIM(character_key) <> ''
     LIMIT 1`,
    [userId]
  );
  return sess.length > 0;
}

/**
 * Remove triplet stuck on главной: no master reading saved and no live session for triplet owner.
 * Other masters' old sessions do not block cleanup.
 */
export async function cleanupStaleTripletDisplay(
  userId: string,
  readings: TripletReadingRow[],
  opts?: { protectIfCreatedWithinMs?: number }
): Promise<boolean> {
  const protectMs = opts?.protectIfCreatedWithinMs ?? 5 * 60 * 1000;

  const triplet = readings
    .filter(
      (r) =>
        r.characterName === "triplet" &&
        (r.contextData?.tarotCards?.length ?? 0) >= 3
    )
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
  if (!triplet) return false;

  const createdAt = triplet.createdAt ? new Date(triplet.createdAt).getTime() : 0;
  if (createdAt && Date.now() - createdAt < protectMs) return false;

  const tripletKey = tarotCardsKey(triplet.contextData?.tarotCards);
  const hasReading = readings.some((row) => {
    if (row.characterName === "triplet") return false;
    const type = row.contextData?.type;
    if (type !== "reading" && type !== "intention_spread") return false;
    return tarotCardsKey(row.contextData?.tarotCards) === tripletKey;
  });
  if (hasReading) return false;

  const owner =
    typeof triplet.contextData?.masterId === "string"
      ? triplet.contextData.masterId
      : null;

  if (owner) {
    const { rows: ownerMem } = await query(
      `SELECT 1 FROM session_memories WHERE user_id = $1 AND character_key = $2 LIMIT 1`,
      [userId, owner]
    );
    if (ownerMem.length) return false;

    const { rows: ownerSess } = await query(
      `SELECT 1 FROM sessions
       WHERE user_id = $1 AND character_key = $2
       LIMIT 1`,
      [userId, owner]
    );
    if (ownerSess.length) return false;
  }

  return (await deleteAllUserTripletHistory(userId)) > 0;
}

/** @deprecated use cleanupStaleTripletDisplay */
export async function cleanupOrphanTripletWhenNoActivity(
  userId: string,
  opts?: { protectIfCreatedWithinMs?: number }
): Promise<boolean> {
  const protectMs = opts?.protectIfCreatedWithinMs ?? 5 * 60 * 1000;

  const { rows } = await query<{ id: string; created_at: Date }>(
    `SELECT id, created_at FROM history
     WHERE user_id = $1 AND character_name = 'triplet'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (!rows[0]) return false;

  const ageMs = Date.now() - new Date(rows[0].created_at).getTime();
  if (ageMs < protectMs) return false;
  if (await userHasConsultationActivity(userId)) return false;

  return (await deleteAllUserTripletHistory(userId)) > 0;
}

/** Drop triplet when a consultation session for daily cards is removed. */
export async function deleteUserTripletForSession(
  userId: string,
  session: {
    spread_type?: string | null;
    character_key?: string | null;
    intention?: string | null;
    cards?: unknown;
  }
): Promise<boolean> {
  if (session.spread_type === "daily") {
    return (await deleteAllUserTripletHistory(userId)) > 0;
  }

  const characterKey = session.character_key?.trim();
  if (!characterKey) return false;

  const { rows } = await query<{ id: string; created_at: Date; context_data: Record<string, unknown> }>(
    `SELECT id, created_at, context_data FROM history
     WHERE user_id = $1 AND character_name = 'triplet'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  const triplet = rows[0];
  if (!triplet) return false;

  const ctx = triplet.context_data ?? {};
  const owner = typeof ctx.masterId === "string" ? ctx.masterId : null;
  const tripletKey = tarotCardsKey(ctx.tarotCards as { name: string }[] | undefined);
  const sessionNames = parseSessionCardNames(session.cards);
  const sessionKey = sessionNames.length
    ? tarotCardsKey(sessionNames.map((name) => ({ name })))
    : "";
  const cardsMatch = Boolean(tripletKey && sessionKey && tripletKey === sessionKey);
  const dailyLike = !session.intention?.trim();
  const ownerMatch = !owner || owner === characterKey;

  if (dailyLike && ownerMatch && (cardsMatch || !sessionKey)) {
    await recordTripletDrawAnchor(userId, triplet.created_at);
    const result = await query(`DELETE FROM history WHERE id = $1 AND user_id = $2`, [
      triplet.id,
      userId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  return false;
}

/** Clear triplet owned by a master when their chat/readings are wiped. */
export async function deleteUserTripletForMaster(
  userId: string,
  masterId: string
): Promise<boolean> {
  const { rows } = await query<{ id: string; created_at: Date; context_data: Record<string, unknown> }>(
    `SELECT id, created_at, context_data FROM history
     WHERE user_id = $1 AND character_name = 'triplet'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  const triplet = rows[0];
  if (!triplet) return false;

  const ctx = triplet.context_data ?? {};
  const owner = typeof ctx.masterId === "string" ? ctx.masterId : null;
  if (owner && owner !== masterId) return false;

  await recordTripletDrawAnchor(userId, triplet.created_at);

  const result = await query(`DELETE FROM history WHERE id = $1 AND user_id = $2`, [
    triplet.id,
    userId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
