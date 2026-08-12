import { query, queryClient, type PoolClient } from "@/lib/db";
import { tripletCooldownFromLastDraw, type TripletCooldownStatus } from "@/lib/triplet-limit";

function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

async function loadTripletCooldown(
  userId: string,
  client?: PoolClient
): Promise<TripletCooldownStatus> {
  const run = <T extends Record<string, unknown>>(text: string, params?: unknown[]) =>
    client ? queryClient<T>(client, text, params) : query<T>(text, params);

  const historySql = `SELECT MAX(created_at) AS created_at FROM history
       WHERE user_id = $1
         AND (
           character_name = 'triplet'
           OR context_data->>'type' IN ('triplet', 'daily_triplet')
         )`;
  const userSql = `SELECT astro_meta FROM users WHERE id = $1`;

  // Same PoolClient cannot run concurrent queries (pg@8 deprecation / pg@9 break).
  let historyRows: { created_at: Date }[];
  let userRows: { astro_meta: Record<string, unknown> | null }[];
  if (client) {
    historyRows = (await run<{ created_at: Date }>(historySql, [userId])).rows;
    userRows = (await run<{ astro_meta: Record<string, unknown> | null }>(userSql, [userId]))
      .rows;
  } else {
    const [historyRes, userRes] = await Promise.all([
      run<{ created_at: Date }>(historySql, [userId]),
      run<{ astro_meta: Record<string, unknown> | null }>(userSql, [userId]),
    ]);
    historyRows = historyRes.rows;
    userRows = userRes.rows;
  }

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

export async function checkTripletCooldown(userId: string): Promise<TripletCooldownStatus> {
  return loadTripletCooldown(userId);
}

/** Cooldown decision inside an open transaction (same client as the entitlement write). */
export async function checkTripletCooldownWithClient(
  client: PoolClient,
  userId: string
): Promise<TripletCooldownStatus> {
  return loadTripletCooldown(userId, client);
}
