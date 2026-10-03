import { NextRequest, NextResponse } from "next/server";
import { requireCronOrAdmin } from "@/lib/cron-auth";
import { ensureDb } from "@/lib/db";
import { EMAIL_LOG_RETENTION_BATCH_LIMIT, OWNERLESS_EMAIL_LOG_RETENTION_DAYS, pruneOwnerlessEmailLogs } from "@/lib/email/log";

export const runtime = "nodejs";

/** Hourly bounded retention for diagnostic rows whose historical owner is unknown. */
export async function GET(request: NextRequest) {
  const forbidden = await requireCronOrAdmin(request);
  if (forbidden) return forbidden;
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }
  const deleted = await pruneOwnerlessEmailLogs();
  return NextResponse.json({ deleted, retentionDays: OWNERLESS_EMAIL_LOG_RETENTION_DAYS, batchLimit: EMAIL_LOG_RETENTION_BATCH_LIMIT });
}
