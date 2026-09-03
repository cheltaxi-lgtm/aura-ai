import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { clientIp } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";
import {
  createUserReview,
  ensureLandingReviewSeed,
  getApprovedReviewSummary,
  hasRecentPendingReview,
  hashReviewIp,
  landingReviewsEnabled,
  listApprovedReviews,
  parseReviewRating,
  sanitizeReviewCity,
  validateReviewSubmission,
} from "@/lib/landing-reviews";
import { LANDING_REVIEW_PAGE_SIZE } from "@/lib/landing-reviews-shared";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!landingReviewsEnabled()) {
    return NextResponse.json({ enabled: false, items: [], summary: { count: 0, averageRating: 0 } });
  }
  await ensureDb();
  await ensureLandingReviewSeed();

  const ip = clientIp(request);
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("landing_review_get", ip),
    60,
    60_000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined }
    );
  }

  const publishedAt = request.nextUrl.searchParams.get("publishedAt");
  const idRaw = request.nextUrl.searchParams.get("id");
  const id =
    idRaw && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idRaw)
      ? idRaw
      : null;
  const limitRaw = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  const { items, nextCursor } = await listApprovedReviews({
    limit: Number.isFinite(limitRaw) ? limitRaw : LANDING_REVIEW_PAGE_SIZE,
    cursorPublishedAt: publishedAt,
    cursorId: id,
  });
  const summary = await getApprovedReviewSummary();
  return NextResponse.json(
    { enabled: true, items, nextCursor, summary },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
  );
}

export async function POST(request: NextRequest) {
  if (!landingReviewsEnabled()) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const auth = await getAuth();
  if (!auth || auth.role !== "user") {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  const userAccountId = auth.sub;
  await ensureDb();

  const ip = clientIp(request);
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("landing_review_post", ip),
    2,
    86_400_000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.website_url === "string" && body.website_url.trim()) {
    return NextResponse.json({ ok: true, pending: true }, { status: 201 });
  }

  const recaptchaToken = typeof body.recaptchaToken === "string" ? body.recaptchaToken : undefined;
  const captchaBlock = await enforceRecaptchaScope("reviews", recaptchaToken, request);
  if (captchaBlock) return captchaBlock;

  const product = typeof body.product === "string" ? body.product : "general";
  const parsed = validateReviewSubmission({
    name: typeof body.name === "string" ? body.name : "",
    body: typeof body.body === "string" ? body.body : "",
    rating: parseReviewRating(body.rating),
    product,
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const ipHash = hashReviewIp(ip);
  if (await hasRecentPendingReview({ userAccountId, ipHash })) {
    return NextResponse.json({ error: "already_pending" }, { status: 409 });
  }

  const created = await createUserReview({
    name: parsed.name,
    city: sanitizeReviewCity(typeof body.city === "string" ? body.city : null),
    body: parsed.body,
    rating: parsed.rating,
    product: parsed.product,
    userAccountId,
    ipHash,
  });
  return NextResponse.json({ ok: true, pending: true, id: created.id }, { status: 201 });
}
