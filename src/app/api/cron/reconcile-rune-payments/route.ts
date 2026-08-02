import { NextRequest, NextResponse } from "next/server";
import { isCronSecretValid } from "@/lib/cron-auth";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { reconcileAllRecentRunePurchases } from "@/lib/rune-payment-reconcile";

export async function GET(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const isInternal = isCronSecretValid(request);
  const admin = await requireAdmin();

  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hoursParam = request.nextUrl.searchParams.get("hours");
  const hours = hoursParam ? Math.min(168, Math.max(1, Number(hoursParam))) : 72;

  const result = await reconcileAllRecentRunePurchases(hours, 300);

  return NextResponse.json({ hours, ...result });
}
