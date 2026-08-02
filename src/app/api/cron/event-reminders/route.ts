import { NextRequest, NextResponse } from "next/server";
import { isCronSecretValid } from "@/lib/cron-auth";
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
    const when = daysUntilLabel(ev.eventDate);
    const topic = cleanEventTopic(ev.fact, ev.eventDate);
    const question = buildAutoAsk(topic, when);
    const master = ev.sourceCharacter?.trim() ?? "";
    const ctaPath = `/?ask=${encodeURIComponent(question)}${
      master ? `&master=${encodeURIComponent(master)}` : ""
    }`;

    await dispatchNotification({
      userId: ev.userId,
      type: "event_reminder",
      title: when ? `Важный день — ${when}` : "Важный день впереди",
      body: `Вы упоминали: «${topic}». ${whenSentence(when)}Загляните к мастеру — посмотрим, что вас ждёт.`,
      data: {
        factId: ev.factId,
        eventDate: ev.eventDate,
        sourceCharacter: ev.sourceCharacter,
      },
      ctaPath,
      ctaLabel: "Получить расклад",
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

/** Turn a raw stored memory line into a short, readable topic for the user. */
function cleanEventTopic(fact: string, eventDate: string): string {
  let t = (fact ?? "").trim();
  if (eventDate) t = t.split(eventDate).join(" ");
  // Drop any leftover ISO dates and the cron-side phrasing that reads oddly.
  t = t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  t = t.replace(/^у\s+клиента\s+/i, "");
  t = t.replace(/\s{2,}/g, " ").trim();
  // Trim trailing separators/punctuation left behind by the removals.
  t = t.replace(/[\s,;:.\-–—]+$/u, "").trim();
  if (t.length > 90) t = `${t.slice(0, 87).trim()}…`;
  return t || "важное событие";
}

function whenSentence(when: string): string {
  if (!when) return "";
  if (when === "сегодня") return "Это уже сегодня. ";
  if (when === "завтра") return "Это уже завтра. ";
  return `Это ${when}. `;
}

/**
 * Build the message that is auto-sent to the master from the reminder CTA.
 * Must NOT match FULL_SPREAD_REQUEST_RE (no "сделай/полный расклад"), so it goes
 * through the normal chat path and the master answers the topic directly.
 */
function buildAutoAsk(topic: string, when: string): string {
  const whenClause = when ? `Это ${when}. ` : "";
  return `Хочу разобраться с важным событием: ${topic}. ${whenClause}Что меня ждёт и на что важно обратить внимание?`;
}
