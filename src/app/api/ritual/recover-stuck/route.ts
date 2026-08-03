import { NextRequest, NextResponse } from "next/server";
import { isCronSecretValid } from "@/lib/cron-auth";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { listStuckGeneratingRituals } from "@/lib/ritual-service";
import { runRitualGenerationForUser } from "@/lib/ritual-generation-runner";

/** Recover rituals stuck in `generating` (cron / admin). */
export async function GET(request: NextRequest) {
  await ensureDb();

  const isInternal = isCronSecretValid(request);
  const admin = await requireAdmin();

  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const olderThan = Number(request.nextUrl.searchParams.get("olderThanMinutes") ?? "15");
  const stuck = await listStuckGeneratingRituals(
    Number.isFinite(olderThan) ? olderThan : 15
  );

  let recovered = 0;
  let failed = 0;

  for (const row of stuck) {
    const outcome = await runRitualGenerationForUser({
      ritualId: row.id,
      userId: row.user_id,
      rollbackOnFailure: true,
    });
    if (outcome.ok) recovered++;
    else failed++;
  }

  return NextResponse.json({
    scanned: stuck.length,
    recovered,
    failed,
  });
}
