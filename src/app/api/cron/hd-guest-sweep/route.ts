import { NextRequest, NextResponse } from "next/server";
import { isCronSecretValid } from "@/lib/cron-auth";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db";
import { sweepGuestPoolHdCharts } from "@/lib/services/human-design-service";

export const runtime = "nodejs";

/**
 * Expire unclaimed guest-pool HD charts past TTL (30 days) — bounds the guest
 * pool and gives claim tokens an effective lifetime. Owned charts untouched.
 */
export async function GET(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }

  const isInternal = isCronSecretValid(request);
  const admin = await requireAdmin();
  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deleted = await sweepGuestPoolHdCharts(30, 500);
  return NextResponse.json({ deleted });
}
