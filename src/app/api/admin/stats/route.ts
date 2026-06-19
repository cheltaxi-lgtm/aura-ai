import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDashboardStats, getRecentPaymentsChart } from "@/lib/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [stats, chart] = await Promise.all([getDashboardStats(), getRecentPaymentsChart()]);
  return NextResponse.json({ stats, chart });
}
