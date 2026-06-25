import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin";
import { ensureDb } from "@/lib/db";
import { runMemoryMaintenance } from "@/lib/memory/user-facts";

/**
 * Re-embeds long-term memory facts that were stored without a vector
 * (e.g. while the embeddings provider was unavailable). Safe to call
 * repeatedly; intended for an admin button or a cron job.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 200;

  const result = await runMemoryMaintenance(limit);
  await logAdminAction(auth.sub, "memory_maintenance", "system", undefined, result);
  return NextResponse.json({ ok: true, ...result });
}
