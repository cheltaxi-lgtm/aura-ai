import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isPalmReadingEnabled } from "@/lib/settings";
import { listPalmArchive } from "@/lib/palm-reading-archive";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isPalmReadingEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "palm_readings");
  if (rateLimited) return rateLimited;
  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }
  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const entries = await listPalmArchive(profileUserId);
  return NextResponse.json({
    readings: entries.map((entry) => ({
      snapshotId: entry.snapshotId,
      historyId: entry.historyId,
      paid: entry.paid,
      createdAt: entry.createdAt,
      reportAt: entry.reportAt,
      whichHand: entry.snapshot.whichHand,
      handShape: entry.snapshot.handShape,
      verdict: entry.snapshot.verdict,
      teaser: entry.snapshot.teaser ?? null,
    })),
  });
}
