import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import { getRuneBalance, isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { RITUAL_TYPES } from "@/lib/ritual-config";
import {
  getRitualById,
  markRitualPaidAndGenerating,
  ritualToClient,
} from "@/lib/ritual-service";

type RouteContext = { params: Promise<{ id: string }> };

/** Charge runes and mark ritual as `generating`. Client calls `/regenerate` to build text. */
export async function POST(_request: NextRequest, context: RouteContext) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(authed.auth.sub, "ritual_pay");
  if (rateLimited) return rateLimited;

  const { id } = await context.params;
  const ritual = await getRitualById(id);

  if (!ritual || ritual.user_id !== authed.profileUserId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ritual.status !== "payment") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const cost = ritual.rune_cost;
  const unlimited = await resolveUnlimitedAccess({
    accountId: authed.auth.sub,
    profileUserId: authed.profileUserId,
  });
  const runeSettings = await getRuneSettings();
  const useBilling = isRuneBillingActive(
    authed.profileUserId,
    unlimited,
    runeSettings
  );

  let billingCharge: BillingChargeResult | null = null;

  if (useBilling && cost > 0) {
    const label = RITUAL_TYPES[ritual.ritual_type].label;
    try {
      billingCharge = await BillingService.chargeForSession({
        userId: authed.profileUserId,
        cost,
        actionType: "ritual",
        description: `Обряд: ${label}`,
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        return insufficientFundsResponse(err);
      }
      throw err;
    }
  }

  const generating = await markRitualPaidAndGenerating(id, {
    paymentStatus: billingCharge ? "paid" : "free",
    transactionId: billingCharge?.transactionId ?? null,
  });
  if (!generating) {
    if (billingCharge) {
      await BillingService.rollbackCharge({
        userId: authed.profileUserId,
        cost: billingCharge.spentRunes,
        wasFreeQuestion: false,
        actionType: "ritual",
      });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  const balance = await getRuneBalance(authed.profileUserId);

  return NextResponse.json({
    ok: true,
    status: "generating",
    ritual: ritualToClient(generating),
    balance,
  });
}
