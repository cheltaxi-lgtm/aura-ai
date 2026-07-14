import { NextRequest, NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { computeDeepTransits, INGRESS_NOTIFY_KEYS, localTodayForPlace } from "@/lib/natal/transits";
import { transitNotificationNote } from "@/lib/natal/transit-memory";
import type { NatalChartRecord } from "@/lib/natal/types";
import { dispatchNotification } from "@/lib/notify";
import { getNotificationPrefs } from "@/lib/daily-reminder-service";
import { localHourInTimezone } from "@/lib/natal/time";

const NOTIFY_TRANSIT_KEYS = INGRESS_NOTIFY_KEYS;

/**
 * Daily transit digest for users with stored natal charts.
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
    chart_data: NatalChartRecord;
    last_transit_notify_at: Date | string | null;
  }>(
    `SELECT user_id, chart_data, last_transit_notify_at
     FROM natal_charts
     WHERE chart_data IS NOT NULL`
  );

  let notified = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const chart = row.chart_data;
      if (!chart?.western || !chart.place) continue;
      if (localHourInTimezone(chart.place.timezone) !== 9) continue;
      const prefs = await getNotificationPrefs(row.user_id);
      if (!prefs.dailyInApp) continue;

      const today = localTodayForPlace(chart.place);
      const lastInstant =
        row.last_transit_notify_at instanceof Date
          ? row.last_transit_notify_at
          : row.last_transit_notify_at
            ? new Date(row.last_transit_notify_at)
            : null;
      const last =
        lastInstant && !Number.isNaN(lastInstant.getTime())
          ? localTodayForPlace(chart.place, lastInstant)
          : null;
      if (last === today) continue;

      const transits = await computeDeepTransits(
        { ...chart, userId: row.user_id },
        { horizonDays: 0, correlateMemory: false }
      );

      const aspectHits = transits.filter(
        (t) =>
          t.kind === "aspect_hit" &&
          t.date === today &&
          t.planetKey &&
          NOTIFY_TRANSIT_KEYS.has(t.planetKey)
      );
      const signIngresses = transits.filter(
        (t) =>
          t.kind === "sign_change" &&
          t.date === today &&
          t.planetKey &&
          NOTIFY_TRANSIT_KEYS.has(t.planetKey)
      );

      const highlights = [...aspectHits, ...signIngresses].slice(0, 3);
      if (!highlights.length) continue;

      const body = highlights.map((h) => transitNotificationNote(h)).join(" ");
      await dispatchNotification({
        userId: row.user_id,
        type: "natal_transit",
        title: "Астрологический транзит",
        body: body.slice(0, 280),
        ctaPath: "/cabinet",
        ctaLabel: "Карта рождения",
        data: {
          transits: highlights.map((h) => h.planet),
          aspects: aspectHits.map((h) => `${h.planet}-${h.aspect}-${h.target}`),
        },
      });

      await query(
        `UPDATE natal_charts SET last_transit_notify_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
        [row.user_id]
      );
      notified++;
    } catch (error) {
      errors++;
      console.warn("[natal-transits] user notify failed:", row.user_id, error);
    }
  }

  return NextResponse.json({ processed: rows.length, notified, errors });
}
