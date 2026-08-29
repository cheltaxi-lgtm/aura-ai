import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin";
import { moderateLandingReview, updateLandingReviewNote } from "@/lib/landing-reviews";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    adminNote?: string | null;
  };
  const note = typeof body.adminNote === "string" ? body.adminNote.slice(0, 500) : undefined;

  if (body.status === "approved" || body.status === "rejected") {
    const review = await moderateLandingReview({
      id,
      status: body.status,
      adminNote: note ?? null,
      moderator: auth.email,
    });
    if (!review) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await logAdminAction(auth.sub, "update", "landing_review", id, {
      status: review.status,
    });
    return NextResponse.json({ review });
  }

  if (note !== undefined) {
    const review = await updateLandingReviewNote({
      id,
      adminNote: note,
      moderator: auth.email,
    });
    if (!review) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await logAdminAction(auth.sub, "update", "landing_review", id, { note: true });
    return NextResponse.json({ review });
  }

  return NextResponse.json({ error: "status_invalid" }, { status: 400 });
}
