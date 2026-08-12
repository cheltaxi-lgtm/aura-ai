import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { notifyProAccountApproved } from "@/lib/email/pro-notify";
import { requireProEnabled } from "@/modules/pro/gate";
import {
  listAccounts,
  setAccountStatus,
  setAccountTier,
} from "@/modules/pro/db/accounts";

export async function GET() {
  const gated = requireProEnabled();
  if (gated) return gated;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const accounts = await listAccounts(200);
  return NextResponse.json({
    ok: true,
    accounts: accounts.map((a) => ({
      id: a.id,
      user_id: a.user_id,
      status: a.status,
      tier: a.tier,
      display_name: a.display_name,
      brand_slug: a.brand_slug,
      limits: a.limits,
      created_at: a.created_at,
    })),
  });
}

export async function PATCH(req: Request) {
  const gated = requireProEnabled();
  if (gated) return gated;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    status?: "pending" | "active" | "suspended" | "closed";
    tier?: "free_trial" | "pro";
    trialEndsAt?: string;
    trialRunes?: number;
  };
  if (!body.id || (!body.status && !body.tier)) {
    return NextResponse.json({ error: "id_and_status_or_tier_required" }, { status: 400 });
  }

  if (body.tier) {
    if (body.tier !== "free_trial" && body.tier !== "pro") {
      return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
    }
    const trialEndsAt =
      typeof body.trialEndsAt === "string" && !Number.isNaN(Date.parse(body.trialEndsAt))
        ? new Date(body.trialEndsAt).toISOString()
        : null;
    const trialRunes =
      typeof body.trialRunes === "number" && Number.isFinite(body.trialRunes) && body.trialRunes >= 0
        ? Math.floor(body.trialRunes)
        : null;
    const account = await setAccountTier(body.id, body.tier, admin.sub, {
      trialEndsAt,
      trialRunes,
    });
    if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, account });
  }

  const account = await setAccountStatus(body.id, body.status!, admin.sub);
  if (!account) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (body.status === "active") {
    void notifyProAccountApproved({
      profileUserId: account.user_id,
      displayName: account.display_name,
    });
  }
  return NextResponse.json({ ok: true, account });
}
