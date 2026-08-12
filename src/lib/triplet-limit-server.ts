import { query, queryClient, type PoolClient } from "@/lib/db";
import { tripletCooldownFromLastDraw, type TripletCooldownStatus } from "@/lib/triplet-limit";

function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Dedicated daily entitlement anchor only.
 * Legacy lastTripletDrawAt is ignored: it was polluted by ordinary onboarding triplets
 * and must never be standalone daily authority.
 */
function dailyAnchorFromMeta(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null;
  if (
    typeof meta.lastDailyTripletDrawAt === "string" &&
    meta.lastDailyTripletDrawAt.trim()
  ) {
    return meta.lastDailyTripletDrawAt.trim();
  }
  return null;
}

/**
 * Rolling 24h daily entitlement cooldown.
 * Evidence = explicit daily_triplet history OR dedicated daily anchor only.
 * Ordinary character_name='triplet' / type='triplet' do NOT consume daily.
 */
async function loadDailyTripletCooldown(
  userId: string,
  client?: PoolClient
): Promise<TripletCooldownStatus> {
  const run = <T extends Record<string, unknown>>(text: string, params?: unknown[]) =>
    client ? queryClient<T>(client, text, params) : query<T>(text, params);

  const historySql = `SELECT MAX(created_at) AS created_at FROM history
       WHERE user_id = $1
         AND context_data->>'type' = 'daily_triplet'`;
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
  const historyIso = historyAt
    ? historyAt instanceof Date
      ? historyAt.toISOString()
      : String(historyAt)
    : null;
  const anchorAt = dailyAnchorFromMeta(userRows[0]?.astro_meta ?? null);

  const effectiveIso = laterIso(historyIso, anchorAt);
  return tripletCooldownFromLastDraw(effectiveIso);
}

/** @deprecated name kept for call-site compatibility — daily entitlement only. */
export async function checkTripletCooldown(userId: string): Promise<TripletCooldownStatus> {
  return loadDailyTripletCooldown(userId);
}

/** Daily cooldown decision inside an open transaction (same client as entitlement write). */
export async function checkTripletCooldownWithClient(
  client: PoolClient,
  userId: string
): Promise<TripletCooldownStatus> {
  return loadDailyTripletCooldown(userId, client);
}

export const checkDailyTripletCooldown = checkTripletCooldown;
export const checkDailyTripletCooldownWithClient = checkTripletCooldownWithClient;
