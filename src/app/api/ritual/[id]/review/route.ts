import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { submitRitualReview, getRitualById } from "@/lib/ritual-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const ritual = await getRitualById(id);

  if (!ritual || ritual.user_id !== authed.profileUserId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    outcomeText?: string;
    outcomeRating?: number;
    sharePublicly?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rating = body.outcomeRating;
  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
  }

  const ok = await submitRitualReview(id, {
    outcomeText: body.outcomeText?.trim(),
    outcomeRating: rating,
    sharePublicly: body.sharePublicly,
  });

  if (!ok) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
