import { query, type PoolClient } from "@/lib/db";

function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function toDateStr(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Persist triplet + daily-reading cooldown anchors before activity purge wipes history rows. */
export async function preserveUserRateLimitsBeforePurge(
  userId: string,
  client: PoolClient
): Promise<void> {
  const [historyRes, userRes, dailyRes] = await Promise.all([
    client.query<{ created_at: Date | null }>(
      `SELECT MAX(created_at) AS created_at FROM history
       WHERE user_id = $1
         AND (
           character_name = 'triplet'
           OR context_data->>'type' = 'triplet'
         )`,
      [userId]
    ),
    client.query<{ astro_meta: Record<string, unknown> | null }>(
      `SELECT astro_meta FROM users WHERE id = $1`,
      [userId]
    ),
    client.query<{ reading_date: Date | string; spread_id: string | null }>(
      `SELECT reading_date, spread_id FROM daily_readings
       WHERE user_id = $1
       ORDER BY reading_date DESC
       LIMIT 1`,
      [userId]
    ),
  ]);

  const patch: Record<string, string> = {};
  const historyAt = historyRes.rows[0]?.created_at;
  const historyIso = historyAt
    ? historyAt instanceof Date
      ? historyAt.toISOString()
      : String(historyAt)
    : null;
  const anchorRaw = userRes.rows[0]?.astro_meta?.lastTripletDrawAt;
  const anchorIso =
    typeof anchorRaw === "string" && anchorRaw.trim() ? anchorRaw.trim() : null;
  const tripletIso = laterIso(historyIso, anchorIso);
  if (tripletIso) patch.lastTripletDrawAt = tripletIso;

  const dailyRow = dailyRes.rows[0];
  if (dailyRow?.reading_date) {
    patch.lastDailyReadingDate = toDateStr(dailyRow.reading_date);
    if (dailyRow.spread_id?.trim()) {
      patch.lastDailyReadingSpreadId = dailyRow.spread_id.trim();
    }
  }

  if (Object.keys(patch).length === 0) return;

  await client.query(
    `UPDATE users
     SET astro_meta = COALESCE(astro_meta, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [userId, JSON.stringify(patch)]
  );
}

/** Admin reset: drop persisted daily-reading cooldown after content is wiped. */
export async function clearDailyReadingAnchors(userId: string): Promise<boolean> {
  const { rows } = await query<{ astro_meta: Record<string, unknown> | null }>(
    `SELECT astro_meta FROM users WHERE id = $1`,
    [userId]
  );
  const meta = rows[0]?.astro_meta ?? {};
  const hadAnchor =
    (typeof meta.lastDailyReadingDate === "string" && Boolean(meta.lastDailyReadingDate.trim())) ||
    (typeof meta.lastDailyReadingSpreadId === "string" &&
      Boolean(meta.lastDailyReadingSpreadId.trim()));

  await query(
    `UPDATE users
     SET astro_meta = COALESCE(astro_meta, '{}'::jsonb)
       - 'lastDailyReadingDate'
       - 'lastDailyReadingSpreadId'
     WHERE id = $1`,
    [userId]
  );

  return hadAnchor;
}

export async function recordDailyReadingAnchor(
  userId: string,
  readingDate: string,
  spreadId: string
): Promise<void> {
  await query(
    `UPDATE users
     SET astro_meta = COALESCE(astro_meta, '{}'::jsonb)
       || jsonb_build_object(
            'lastDailyReadingDate', $2::text,
            'lastDailyReadingSpreadId', $3::text
          )
     WHERE id = $1`,
    [userId, readingDate, spreadId]
  );
}

export async function getDailyReadingAnchor(userId: string): Promise<{
  date: string | null;
  spreadId: string | null;
}> {
  const { rows } = await query<{ astro_meta: Record<string, unknown> | null }>(
    `SELECT astro_meta FROM users WHERE id = $1`,
    [userId]
  );
  const meta = rows[0]?.astro_meta ?? {};
  const date =
    typeof meta.lastDailyReadingDate === "string" && meta.lastDailyReadingDate.trim()
      ? meta.lastDailyReadingDate.trim()
      : null;
  const spreadId =
    typeof meta.lastDailyReadingSpreadId === "string" && meta.lastDailyReadingSpreadId.trim()
      ? meta.lastDailyReadingSpreadId.trim()
      : null;
  return { date, spreadId };
}

export async function isDailyReadingUsedToday(
  userId: string,
  localDate: string
): Promise<{ used: boolean; spreadId: string | null; hasContent: boolean }> {
  const { rows } = await query<{ spread_id: string | null }>(
    `SELECT spread_id FROM daily_readings
     WHERE user_id = $1 AND reading_date = $2::date
     LIMIT 1`,
    [userId, localDate]
  );
  if (rows[0]) {
    return {
      used: true,
      spreadId: rows[0].spread_id,
      hasContent: true,
    };
  }

  const anchor = await getDailyReadingAnchor(userId);
  if (anchor.date === localDate) {
    return {
      used: true,
      spreadId: anchor.spreadId,
      hasContent: false,
    };
  }

  return { used: false, spreadId: null, hasContent: false };
}
