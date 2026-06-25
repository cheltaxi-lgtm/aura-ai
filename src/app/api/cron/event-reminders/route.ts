import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { getGlobalUpcomingEvents } from "@/lib/memory/user-facts";
import { dispatchNotification } from "@/lib/notify";

/**
 * Proactive re-engagement: notify users a few days before a dated event we
 * already know about (from long-term memory) so a master can offer a reading.
 *
 * Trigger: cron with `x-cron-secret`, or an authenticated admin (manual run).
 * Dedup is handled inside getGlobalUpcomingEvents (one reminder per event).
 */
export async function GET(request: NextRequest) {
  await ensureDb();

  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  const isInternal = cronSecret && headerSecret === cronSecret;
  const admin = await requireAdmin();

  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const leadDaysRaw = Number(request.nextUrl.searchParams.get("leadDays"));
  const leadDays = Number.isFinite(leadDaysRaw) && leadDaysRaw > 0 ? Math.min(leadDaysRaw, 30) : 3;

  const events = await getGlobalUpcomingEvents(leadDays);
  let processed = 0;

  for (const ev of events) {
    const when = daysUntilLabel(ev.eventDate);
    await dispatchNotification({
      userId: ev.userId,
      type: "event_reminder",
      title: when ? `Скоро важный день — ${when}` : "Скоро важный день",
      body: `Ты упоминал(а): «${ev.fact}». ${when ? `Это уже ${when}. ` : ""}Хочешь расклад на исход? Мастер ждёт в чате.`,
      data: {
        factId: ev.factId,
        eventDate: ev.eventDate,
        sourceCharacter: ev.sourceCharacter,
      },
      ctaPath: "/",
      ctaLabel: "Спросить мастера",
    });
    processed++;
  }

  return NextResponse.json({ processed, total: events.length, leadDays });
}

function daysUntilLabel(iso: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) return "";
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff >= 2 && diff <= 4) return `через ${diff} дня`;
  return `через ${diff} дней`;
}
