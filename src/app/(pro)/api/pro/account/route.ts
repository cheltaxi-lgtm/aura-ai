import { NextResponse } from "next/server";
import {
  authRequiredResponse,
  needsProfileResponse,
  requireProfileUserId,
  requireUserAuth,
} from "@/lib/require-auth";
import { getRuneBalance } from "@/lib/rune-service";
import { requireProPractitioner } from "@/modules/pro/auth";
import { getProBillingMode } from "@/modules/pro/config";
import {
  applyForProAccount,
  getAccountByUserId,
  updateOnboarding,
} from "@/modules/pro/db/accounts";
import { getUsageSummary } from "@/modules/pro/db/billing";
import { requireProEnabled } from "@/modules/pro/gate";

export async function GET() {
  const gated = requireProEnabled();
  if (gated) return gated;
  const profile = await requireProfileUserId();
  if (!profile) {
    if (!(await requireUserAuth())) return authRequiredResponse();
    return needsProfileResponse();
  }
  const account = await getAccountByUserId(profile.profileUserId);
  if (!account) return NextResponse.json({ ok: true, account: null });
  const usage = await getUsageSummary(account.id);
  const balance = await getRuneBalance(profile.profileUserId);
  return NextResponse.json({
    ok: true,
    account,
    billingMode: getProBillingMode(),
    runeBalance: balance,
    usage,
  });
}

export async function POST(req: Request) {
  const gated = requireProEnabled();
  if (gated) return gated;
  const profile = await requireProfileUserId();
  if (!profile) {
    if (!(await requireUserAuth())) return authRequiredResponse();
    return needsProfileResponse();
  }
  const body = (await req.json().catch(() => ({}))) as {
    displayName?: string;
    action?: string;
    onboarding?: {
      specializations?: string[];
      bio?: string;
      timezone?: string;
      addressForm?: "ty" | "vy" | "neutral";
    };
  };

  if (body.action === "onboarding") {
    const prac = await requireProPractitioner({ allowPending: true });
    if (!prac.ok) return prac.response;
    const updated = await updateOnboarding(prac.ctx.account.id, {
      displayName:
        typeof body.displayName === "string" ? body.displayName : undefined,
      specializations: Array.isArray(body.onboarding?.specializations)
        ? body.onboarding!.specializations
        : undefined,
      bio: typeof body.onboarding?.bio === "string" ? body.onboarding.bio : undefined,
      timezone:
        typeof body.onboarding?.timezone === "string"
          ? body.onboarding.timezone
          : undefined,
      addressForm: body.onboarding?.addressForm,
      onboardingState: { completed: true, ...(body.onboarding || {}) },
    });
    return NextResponse.json({ ok: true, account: updated });
  }

  const result = await applyForProAccount({
    userId: profile.profileUserId,
    displayName: body.displayName ?? null,
  });
  return NextResponse.json({ ok: true, ...result });
}
