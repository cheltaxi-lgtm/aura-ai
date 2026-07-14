import { NextRequest, NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { dispatchNotification } from "@/lib/notify";
import type { PersonalTimingResult, TimingCategory } from "@/lib/natal/timing";
import { getOrComputePersonalTiming } from "@/lib/services/natal-timing-service";

export const maxDuration = 300;

const CANDIDATE_LIMIT = 60;
const GENERATION_CONCURRENCY = 4;

/**
 * Hourly personal-timing digest. Candidate filtering, due-frequency checks,
 * and cache selection happen in SQL; this route never scans all charts or
 * performs long-horizon ephemeris work.
 * Trigger: cron with x-cron-secret, or authenticated admin.
 */
export async function GET(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ skipped: true, reason: "feature_disabled" });
  }

  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  const isInternal = cronSecret && headerSecret === cronSecret;
  const admin = await requireAdmin();
  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { rows } = await query<{
    user_id: string;
    categories: TimingCategory[];
    planet_importance: string[];
    timezone: string;
    timing_data: PersonalTimingResult | null;
  }>(
    `SELECT prefs.user_id, prefs.categories, prefs.planet_importance,
            prefs.timezone, cache.timing_data
     FROM natal_event_preferences prefs
     LEFT JOIN LATERAL (
       SELECT timing_data
       FROM natal_timing_cache
       WHERE user_id = prefs.user_id
         AND horizon_days = 7
         AND timing_data IS NOT NULL
         AND generated_at > NOW() - INTERVAL '48 hours'
       ORDER BY generated_at DESC
       LIMIT 1
     ) cache ON TRUE
     WHERE prefs.enabled = TRUE
       AND prefs.in_app = TRUE
       AND EXTRACT(HOUR FROM NOW() AT TIME ZONE prefs.timezone) = 9
       AND (
         prefs.last_notified_at IS NULL
         OR (prefs.frequency = 'daily' AND prefs.last_notified_at < NOW() - INTERVAL '20 hours')
         OR (prefs.frequency = 'weekly' AND prefs.last_notified_at < NOW() - INTERVAL '6 days 20 hours')
       )
     ORDER BY prefs.last_notified_at NULLS FIRST
     LIMIT ${CANDIDATE_LIMIT}`
  );

  let notified = 0;
  let errors = 0;

  // A due user does not need to visit the timing screen first. Generate only a
  // seven-day cache, with a small worker pool; never trigger 90/365-day work.
  for (let offset = 0; offset < rows.length; offset += GENERATION_CONCURRENCY) {
    await Promise.all(rows.slice(offset, offset + GENERATION_CONCURRENCY).map(async (row) => {
      if (row.timing_data) return;
      try {
        row.timing_data = (await getOrComputePersonalTiming(row.user_id, 7)).timing;
      } catch (error) {
        if (!(error instanceof Error && error.message === "TIMING_GENERATION_BUSY")) {
          errors++;
          console.warn("[natal-transits] timing generation failed:", row.user_id);
        }
      }
    }));
  }

  for (const row of rows) {
    try {
      const timing = row.timing_data;
      if (!timing?.events) continue;
      const localToday = new Intl.DateTimeFormat("en-CA", {
        timeZone: row.timezone, year: "numeric", month: "2-digit", day: "2-digit",
      }).format();
      const tomorrow = new Date(`${localToday}T12:00:00Z`);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const localTomorrow = tomorrow.toISOString().slice(0, 10);
      const highlights = timing.events.filter((event) =>
        (event.date === localToday || event.date === localTomorrow) &&
        row.categories.includes(event.category) &&
        row.planet_importance.includes(event.planetKey)
      ).slice(0, 3);
      if (!highlights.length) continue;

      const deliveryKey = `${localToday}:${highlights.map((event) => event.id).sort().join(",")}`;
      const reserved = await query(
        `INSERT INTO natal_event_delivery_log (user_id, event_key, channel)
         VALUES ($1, $2, 'in_app')
         ON CONFLICT DO NOTHING`,
        [row.user_id, deliveryKey]
      );
      if (reserved.rowCount !== 1) continue;

      const body = highlights.map((event) =>
        event.kind === "ingress"
          ? `${event.planetKey}: переход в ${event.sign}.`
          : `${event.planetKey} ${event.aspect} ${event.targetKey}, пик ${event.peakAtLocal.slice(0, 16)}.`
      ).join(" ");
      try {
        await dispatchNotification({
          userId: row.user_id,
          type: "natal_transit",
          title: "Персональные астрологические периоды",
          body: body.slice(0, 280),
          ctaPath: "/cabinet/astrology",
          ctaLabel: "Открыть периоды",
          data: { eventIds: highlights.map((event) => event.id) },
        });
        await query(
          `UPDATE natal_event_preferences SET last_notified_at = NOW(), updated_at = NOW()
           WHERE user_id = $1`,
          [row.user_id]
        );
      } catch (error) {
        await query(
          `DELETE FROM natal_event_delivery_log
           WHERE user_id = $1 AND event_key = $2 AND channel = 'in_app'`,
          [row.user_id, deliveryKey]
        );
        throw error;
      }
      notified++;
    } catch (error) {
      errors++;
      console.warn("[natal-transits] user notify failed:", row.user_id, error);
    }
  }

  return NextResponse.json({ processed: rows.length, notified, errors });
}
