import { NextRequest, NextResponse } from "next/server";
import { isCronSecretValid } from "@/lib/cron-auth";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { buildEventReminderPayload } from "@/lib/event-reminder-copy";
import { getGlobalUpcomingEvents } from "@/lib/memory/user-facts";
import { dispatchNotification } from "@/lib/notify";
import { finishProactiveContact, reserveProactiveContact } from "@/lib/proactive-contact-policy";

/**
 * Proactive re-engagement: notify users a few days before a dated event we
 * already know about (from long-term memory) so a master can offer a reading.
 *
 * Trigger: cron with `x-cron-secret`, or an authenticated admin (manual run).
 * Dedup is handled inside getGlobalUpcomingEvents (one reminder per event).
 */
export async function GET(request: NextRequest) {
  await ensureDb();

  const isInternal = isCronSecretValid(request);
  const admin = await requireAdmin();

  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const leadDaysRaw = Number(request.nextUrl.searchParams.get("leadDays"));
  const leadDays = Number.isFinite(leadDaysRaw) && leadDaysRaw > 0 ? Math.min(leadDaysRaw, 30) : 3;

  const events = await getGlobalUpcomingEvents(leadDays);
  let processed = 0;

  for (const ev of events) {
    const payload = buildEventReminderPayload(ev);
    const reservation = await reserveProactiveContact(
      ev.userId,
      "event_reminder",
      `event_reminder:${ev.factId}:${ev.eventDate}`
    );
    if (!reservation) continue;
    let delivered = false;
    try {
      await dispatchNotification({
        userId: ev.userId,
        type: "event_reminder",
        ...payload,
      });
      delivered = true;
      processed++;
    } finally {
      await finishProactiveContact(reservation.id, delivered);
    }
  }

  return NextResponse.json({ processed, total: events.length, leadDays });
}
