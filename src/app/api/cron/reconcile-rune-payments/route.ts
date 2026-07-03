import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { reconcileAllRecentRunePurchases } from "@/lib/rune-payment-reconcile";

export async function GET(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  const isInternal = cronSecret && headerSecret === cronSecret;
  const admin = await requireAdmin();

  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hoursParam = request.nextUrl.searchParams.get("hours");
  const hours = hoursParam ? Math.min(168, Math.max(1, Number(hoursParam))) : 72;

  const result = await reconcileAllRecentRunePurchases(hours, 100);

  return NextResponse.json({ hours, ...result });
}
