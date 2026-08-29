import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureLandingReviewSeed, getAdminReviewStats, listAdminReviews } from "@/lib/landing-reviews";
import { LANDING_REVIEW_STATUS_LABELS, isLandingReviewStatus } from "@/lib/landing-reviews-shared";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureLandingReviewSeed();

  const statusParam = request.nextUrl.searchParams.get("status") ?? "pending";
  const status = statusParam === "all" || isLandingReviewStatus(statusParam) ? statusParam : "pending";
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "50", 10);
  const offset = Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10);
  const [reviews, stats] = await Promise.all([
    listAdminReviews({ status, limit, offset }),
    getAdminReviewStats(),
  ]);
  return NextResponse.json({ reviews, stats, labels: { statuses: LANDING_REVIEW_STATUS_LABELS } });
}
