import { NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import { requireProPortalEnabled } from "@/modules/pro/gate";
import {
  ensureLanding,
  ensureLandingIntake,
  updateLanding,
  type ProLandingPatch,
} from "@/modules/pro/db/landings";
import { normalizeLandingSections } from "@/modules/pro/landing-defaults";

function clampInt(n: unknown, min: number, max: number): number | null {
  if (n === null) return null;
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, Math.round(v)));
}

export async function GET() {
  const portalOff = requireProPortalEnabled();
  if (portalOff) return portalOff;

  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;

  const landing = await ensureLanding(prac.ctx.account.id);
  const slug = prac.ctx.account.brand_slug;
  return NextResponse.json({
    ok: true,
    slug,
    publicUrl: slug ? `/p/${slug}` : null,
    displayName: prac.ctx.account.display_name,
    bio: prac.ctx.account.bio,
    landing,
  });
}

export async function PATCH(req: Request) {
  const portalOff = requireProPortalEnabled();
  if (portalOff) return portalOff;

  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: ProLandingPatch = {};

  if (typeof body.published === "boolean") patch.published = body.published;
  if (typeof body.headline === "string") patch.headline = body.headline.trim().slice(0, 200);
  if (typeof body.subheadline === "string") {
    patch.subheadline = body.subheadline.trim().slice(0, 500);
  }
  if (typeof body.promo_badge === "string" || body.promo_badge === null) {
    patch.promo_badge =
      body.promo_badge === null ? null : String(body.promo_badge).trim().slice(0, 200);
  }
  if ("price_rub" in body) {
    patch.price_rub = body.price_rub === null ? null : clampInt(body.price_rub, 0, 1_000_000);
  }
  if ("promo_limit" in body) {
    patch.promo_limit =
      body.promo_limit === null ? null : clampInt(body.promo_limit, 0, 100_000);
  }
  if ("promo_used" in body) {
    const used = clampInt(body.promo_used, 0, 100_000);
    if (used != null) patch.promo_used = used;
  }
  if (body.sections && typeof body.sections === "object") {
    patch.sections = normalizeLandingSections(body.sections);
  }
  if (typeof body.contact_note === "string" || body.contact_note === null) {
    patch.contact_note =
      body.contact_note === null ? null : String(body.contact_note).trim().slice(0, 500);
  }

  if (body.ensureIntake === true) {
    await ensureLandingIntake(prac.ctx.account.id, prac.ctx.profileUserId);
  }

  const landing = await updateLanding(
    prac.ctx.account.id,
    patch,
    prac.ctx.profileUserId
  );

  return NextResponse.json({
    ok: true,
    slug: prac.ctx.account.brand_slug,
    publicUrl: prac.ctx.account.brand_slug
      ? `/p/${prac.ctx.account.brand_slug}`
      : null,
    landing,
  });
}
