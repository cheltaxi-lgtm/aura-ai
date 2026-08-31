import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isAuraReadingEnabled } from "@/lib/settings";
import { listAuraArchive } from "@/lib/aura-reading-archive";

export const runtime = "nodejs";

/**
 * The user's aura archive: paid reports + claimed snapshots awaiting a report.
 * Light DTO (no report bodies, no layer/chakra grids) — detail via [id] route.
 */
export async function GET() {
  if (!(await isAuraReadingEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "aura_readings");
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

  const entries = await listAuraArchive(profileUserId);
  return NextResponse.json({
    readings: entries.map((entry) => ({
      snapshotId: entry.snapshotId,
      historyId: entry.historyId,
      paid: entry.paid,
      createdAt: entry.createdAt,
      reportAt: entry.reportAt,
      dominantColor: entry.snapshot.dominantColor ?? null,
      secondaryColors: entry.snapshot.secondaryColors ?? [],
      verdict: entry.snapshot.verdict ?? null,
      teaser: entry.snapshot.teaser ?? null,
    })),
  });
}
