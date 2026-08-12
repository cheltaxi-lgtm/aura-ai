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
  const [historyRes, userRes, dailyRes, introRes] = await Promise.all([
    client.query<{ created_at: Date | null }>(
      `SELECT MAX(created_at) AS created_at FROM history
       WHERE user_id = $1
         AND context_data->>'type' = 'daily_triplet'`,
      [userId]
    ),
    client.query<{ astro_meta: Record<string, unknown> | null }>(
      `SELECT astro_meta FROM users WHERE id = $1`,
      [userId]
    ),
    client.query<{ reading_date: Date | string; character_key: string | null }>(
      `SELECT reading_date, character_key FROM daily_readings
       WHERE user_id = $1
       ORDER BY reading_date DESC
       LIMIT 1`,
      [userId]
    ),
    client.query<{ first_claim: Date | null }>(
      `SELECT MIN(COALESCE(guest_resume_claimed_at, updated_at, created_at)) AS first_claim
       FROM sessions
       WHERE user_id = $1
         AND guest_resume_status IN ('claimed', 'reading_consumed')`,
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
  const meta = userRes.rows[0]?.astro_meta ?? {};
  const primaryAnchor =
    typeof meta.lastDailyTripletDrawAt === "string" && meta.lastDailyTripletDrawAt.trim()
      ? meta.lastDailyTripletDrawAt.trim()
      : null;
  const legacyAnchor =
    typeof meta.lastTripletDrawAt === "string" && meta.lastTripletDrawAt.trim()
      ? meta.lastTripletDrawAt.trim()
      : null;
  const tripletIso = laterIso(historyIso, laterIso(primaryAnchor, legacyAnchor));
  if (tripletIso) {
    patch.lastDailyTripletDrawAt = tripletIso;
    patch.lastTripletDrawAt = tripletIso;
  }

  const existingIntro =
    typeof meta.guestIntroUsedAt === "string" && meta.guestIntroUsedAt.trim()
      ? meta.guestIntroUsedAt.trim()
      : null;
  const introAt = introRes.rows[0]?.first_claim;
  const introIso = introAt
    ? introAt instanceof Date
      ? introAt.toISOString()
      : String(introAt)
    : null;
  // Lifetime acquisition flag — never clear on purge; keep earliest stamp.
  if (existingIntro) patch.guestIntroUsedAt = existingIntro;
  else if (introIso) patch.guestIntroUsedAt = introIso;

  const dailyRow = dailyRes.rows[0];
  if (dailyRow?.reading_date) {
    patch.lastDailyReadingDate = toDateStr(dailyRow.reading_date);
    // daily_readings has no spread_id column — character_key is the durable hint.
    if (dailyRow.character_key?.trim()) {
      patch.lastDailyReadingSpreadId = dailyRow.character_key.trim();
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

/** Lifetime one-time guest intro (acquisition) — independent of daily triplet cooldown. */
export async function recordGuestIntroUsed(
  userId: string,
  at: Date | string = new Date(),
  client?: PoolClient
): Promise<void> {
  const iso = at instanceof Date ? at.toISOString() : at;
  const run = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : (text: string, params?: unknown[]) => query(text, params);
  await run(
    `UPDATE users
     SET astro_meta = CASE
       WHEN COALESCE(astro_meta->>'guestIntroUsedAt', '') <> '' THEN astro_meta
       ELSE jsonb_set(
         COALESCE(astro_meta, '{}'::jsonb),
         '{guestIntroUsedAt}',
         to_jsonb($2::text),
         true
       )
     END
     WHERE id = $1`,
    [userId, iso]
  );
}

export async function profileHasGuestIntroLifetimeFlag(
  userId: string,
  client?: PoolClient
): Promise<boolean> {
  if (client) {
    const { rows } = await client.query<{ used_at: string | null }>(
      `SELECT astro_meta->>'guestIntroUsedAt' AS used_at FROM users WHERE id = $1`,
      [userId]
    );
    const usedAt = rows[0]?.used_at;
    return typeof usedAt === "string" && Boolean(usedAt.trim());
  }
  const { rows } = await query<{ used_at: string | null }>(
    `SELECT astro_meta->>'guestIntroUsedAt' AS used_at FROM users WHERE id = $1`,
    [userId]
  );
  const usedAt = rows[0]?.used_at;
  return typeof usedAt === "string" && Boolean(usedAt.trim());
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
  const { rows } = await query<{ character_key: string | null }>(
    `SELECT character_key FROM daily_readings
     WHERE user_id = $1 AND reading_date = $2::date
     LIMIT 1`,
    [userId, localDate]
  );
  if (rows[0]) {
    return {
      used: true,
      spreadId: rows[0].character_key,
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
