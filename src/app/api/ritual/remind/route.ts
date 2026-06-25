import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { RITUAL_TYPES } from "@/lib/ritual-config";
import { getDueReminders, markRitualReminded } from "@/lib/ritual-service";
import { dispatchNotification } from "@/lib/notify";

export async function GET(request: NextRequest) {
  await ensureDb();

  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  const isInternal = cronSecret && headerSecret === cronSecret;
  const admin = await requireAdmin();

  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const due = await getDueReminders();
  let processed = 0;

  for (const item of due) {
    const typeLabel = RITUAL_TYPES[item.ritual_type as keyof typeof RITUAL_TYPES]?.label ?? "Обряд";
    await dispatchNotification({
      userId: item.user_id,
      type: "ritual_reminder",
      title: "Прошло 7 дней",
      body: `Были знаки после обряда «${typeLabel}»? Расскажите мастеру.`,
      data: {
        ritualId: item.id,
        characterKey: item.character_key,
        ritualType: item.ritual_type,
      },
      ctaPath: "/cabinet",
      ctaLabel: "Рассказать мастеру",
    });
    await markRitualReminded(item.id);
    processed++;
  }

  return NextResponse.json({ processed, total: due.length });
}
