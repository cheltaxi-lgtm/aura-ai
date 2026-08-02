import { NextRequest, NextResponse } from "next/server";
import { isCronSecretValid } from "@/lib/cron-auth";

import { requireAdmin } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db";
import { expireUnclaimedGuestResumes } from "@/lib/guest-triplet-receipt-db";

export const runtime = "nodejs";

/**
 * Expire unclaimed guest resume receipts past TTL.
 * Never touches claimed / reading_consumed sessions or history.
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

  const expired = await expireUnclaimedGuestResumes(200);
  return NextResponse.json({ expired });
}
