import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { processMemoryExtractionJobs } from "@/lib/memory/client-memory";

/**
 * Drain durable memory extraction outbox.
 * Cron: x-cron-secret, or authenticated admin.
 */
export async function GET(request: NextRequest) {
  await ensureDb();

  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  const isInternal = Boolean(cronSecret && headerSecret === cronSecret);
  const admin = await requireAdmin();
  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limitRaw = Number(request.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 15;

  const result = await processMemoryExtractionJobs(limit);
  return NextResponse.json({ ok: true, ...result });
}
