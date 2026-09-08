import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDashboardStats, getRecentPaymentsChart } from "@/lib/admin";
import { getLlmConcurrencyStats } from "@/lib/llm-concurrency";
import { getSpreadMetricsSummary } from "@/lib/spread-metrics-store";
import { getFirstExperienceAnalytics } from "@/lib/first-experience-analytics";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [stats, chart, spreadMetrics] = await Promise.all([
    getDashboardStats(),
    getRecentPaymentsChart(),
    getSpreadMetricsSummary(),
  ]);
  let firstExperience;
  try {firstExperience=await getFirstExperienceAnalytics();}catch{firstExperience={unavailable:true};}
  return NextResponse.json({ stats, chart, llm: getLlmConcurrencyStats(), spreadMetrics, firstExperience });
}
