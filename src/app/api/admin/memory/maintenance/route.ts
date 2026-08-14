import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin";
import { ensureDb } from "@/lib/db";
import { processMemoryExtractionJobs } from "@/lib/memory/client-memory";
import { processMemoryIntelligenceJobs } from "@/lib/memory/intelligence-rebuild";
import { runMemoryMaintenance } from "@/lib/memory/user-facts";

/**
 * Re-embeds missing vectors, decays/expires stale facts, drains extraction outbox.
 * Safe to call repeatedly; intended for an admin button or a cron job.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 200;

  const result = await runMemoryMaintenance(limit);
  const extraction = await processMemoryExtractionJobs(
    Math.min(20, Math.max(5, Math.floor(limit / 10)))
  ).catch(() => ({ processed: 0, stored: 0, failed: 0 }));
  const intelligence = await processMemoryIntelligenceJobs(
    Math.min(20, Math.max(5, Math.floor(limit / 10)))
  ).catch(() => ({ processed: 0, failed: 0, rebuildMs: 0 }));
  const payload = { ...result, extraction, intelligence };
  await logAdminAction(auth.sub, "memory_maintenance", "system", undefined, payload);
  return NextResponse.json({ ok: true, ...payload });
}
