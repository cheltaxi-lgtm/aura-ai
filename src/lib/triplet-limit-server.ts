import { query } from "@/lib/db";
import { tripletCooldownFromLastDraw, type TripletCooldownStatus } from "@/lib/triplet-limit";

function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

export async function checkTripletCooldown(userId: string): Promise<TripletCooldownStatus> {
  const [{ rows: historyRows }, { rows: userRows }] = await Promise.all([
    query<{ created_at: Date }>(
      `SELECT MAX(created_at) AS created_at FROM history
       WHERE user_id = $1
         AND (
           character_name = 'triplet'
           OR context_data->>'type' = 'triplet'
         )`,
      [userId]
    ),
    query<{ astro_meta: Record<string, unknown> | null }>(
      `SELECT astro_meta FROM users WHERE id = $1`,
      [userId]
    ),
  ]);

  const historyAt = historyRows[0]?.created_at;
  const anchorRaw = userRows[0]?.astro_meta?.lastTripletDrawAt;
  const anchorAt =
    typeof anchorRaw === "string" && anchorRaw.trim() ? anchorRaw : null;

  const historyIso = historyAt
    ? historyAt instanceof Date
      ? historyAt.toISOString()
      : String(historyAt)
    : null;

  const effectiveIso = laterIso(historyIso, anchorAt);
  return tripletCooldownFromLastDraw(effectiveIso);
}
