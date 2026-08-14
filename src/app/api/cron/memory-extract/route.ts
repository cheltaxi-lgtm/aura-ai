import { NextRequest, NextResponse } from "next/server";
import { isCronSecretValid } from "@/lib/cron-auth";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { processMemoryExtractionJobs } from "@/lib/memory/client-memory";
import { processMemoryIntelligenceJobs } from "@/lib/memory/intelligence-rebuild";

/**
 * Drain durable memory extraction outbox.
 * Cron: x-cron-secret, or authenticated admin.
 */
export async function GET(request: NextRequest) {
  await ensureDb();

  const isInternal = isCronSecretValid(request);
  const admin = await requireAdmin();
  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limitRaw = Number(request.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 15;

  const result = await processMemoryExtractionJobs(limit);
  const intelligence = await processMemoryIntelligenceJobs(limit).catch(() => ({
    processed: 0,
    failed: 0,
    rebuildMs: 0,
  }));
  return NextResponse.json({ ok: true, ...result, intelligence });
}
