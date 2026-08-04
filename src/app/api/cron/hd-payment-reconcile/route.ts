import { NextRequest, NextResponse } from "next/server";
import { isCronSecretValid } from "@/lib/cron-auth";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db";
import { reconcileHdReportCharges } from "@/lib/services/human-design-service";

export const runtime = "nodejs";

/**
 * Refund HD charges whose generation never delivered (crashed pending rows,
 * error rows with a held charge). Makes "руны вернутся автоматически" true.
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
  const refunded = await reconcileHdReportCharges(50);
  return NextResponse.json({ refunded });
}
