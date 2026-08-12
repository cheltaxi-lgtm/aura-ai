import { NextResponse } from "next/server";
import { requireProEnabled } from "@/modules/pro/gate";
import {
  getProRetentionIntakeDays,
  getProRetentionThreadDays,
  isProModuleEnabled,
} from "@/modules/pro/config";
import { listEnabledProJobs } from "@/modules/pro/jobs";
import { proQuery } from "@/modules/pro/db";

/**
 * Cron: expire deliveries, close stale threads, retention soft-purge markers.
 * No-op when PRO_MODULE_ENABLED=false (also 404 via gate).
 */
export async function POST(req: Request) {
  const gated = requireProEnabled();
  if (gated) return gated;
  const secret = req.headers.get("x-cron-secret") || "";
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProModuleEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, jobs: [] });
  }

  const jobs = listEnabledProJobs();
  // S2: run maintenance even if job registry still empty — explicit SQL tasks.
  const expired = await proQuery(
    `UPDATE pro.deliveries SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE revoked_at IS NULL
       AND ttl_expires_at IS NOT NULL
       AND ttl_expires_at < NOW()`
  );
  const closed = await proQuery(
    `UPDATE pro.client_threads SET status = 'closed', closed_at = NOW()
     WHERE status = 'open'
       AND created_at < NOW() - INTERVAL '30 days'`
  );

  // Retention purge: raw intake answers and closed-dialog content are PII.
  const intakeDays = getProRetentionIntakeDays();
  const threadDays = getProRetentionThreadDays();
  const purgedIntakes = await proQuery(
    `DELETE FROM pro.intake_responses
     WHERE submitted_at < NOW() - make_interval(days => $1)`,
    [intakeDays]
  );
  const purgedMessages = await proQuery(
    `DELETE FROM pro.thread_messages m
     USING pro.client_threads t
     WHERE m.thread_id = t.id
       AND t.status = 'closed'
       AND t.closed_at IS NOT NULL
       AND t.closed_at < NOW() - make_interval(days => $1)`,
    [threadDays]
  );

  return NextResponse.json({
    ok: true,
    jobs,
    expiredDeliveries: expired.rowCount ?? 0,
    closedThreads: closed.rowCount ?? 0,
    purgedIntakeResponses: purgedIntakes.rowCount ?? 0,
    purgedThreadMessages: purgedMessages.rowCount ?? 0,
  });
}
