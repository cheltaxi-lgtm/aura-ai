import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function requireCronOrAdmin(
  request: NextRequest
): Promise<NextResponse | null> {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  const isInternal = Boolean(cronSecret && headerSecret === cronSecret);
  const admin = await requireAdmin();
  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }
  return null;
}
