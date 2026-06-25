import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDashboardStats, getRecentPaymentsChart } from "@/lib/admin";
import { getLlmConcurrencyStats } from "@/lib/llm-concurrency";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [stats, chart] = await Promise.all([getDashboardStats(), getRecentPaymentsChart()]);
  return NextResponse.json({ stats, chart, llm: getLlmConcurrencyStats() });
}
