import { NextRequest, NextResponse } from "next/server";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  readRequestChargeIdempotencyKey,
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
import {
  isRitualPayAlreadyClaimed,
  ritualPayAlreadyDonePayload,
} from "@/lib/ritual-pay-idempotent";
import { getUserById } from "@/lib/users";

type RouteContext = { params: Promise<{ id: string }> };

/** Charge runes and mark ritual as `generating`. Client calls `/regenerate` to build text. */
export async function POST(request: NextRequest, context: RouteContext) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileRow = await getUserById(authed.profileUserId);
  if (!profileRow || !isUserAgeEligible(profileRow)) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(authed.auth.sub, "ritual_pay");
  if (rateLimited) return rateLimited;

  const { id } = await context.params;
  const ritual = await getRitualById(id);

  if (!ritual || ritual.user_id !== authed.profileUserId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Idempotent replay: pay already claimed — return live ritual (never 400/409).
  if (isRitualPayAlreadyClaimed(ritual.status)) {
    const balance = await getRuneBalance(authed.profileUserId);
    return NextResponse.json(
      ritualPayAlreadyDonePayload(ritual, balance, ritualToClient(ritual))
    );
  }

  if (ritual.status !== "payment") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const clientIdem = readRequestChargeIdempotencyKey(request);

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
        // Stable per ritual; client Idempotency-Key wins when present.
        idempotencyKey: clientIdem ?? `ritual-pay:${id}`,
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
    // Race / dedupe: another pay already claimed — resume, do not refund a no-op (spentRunes=0).
    const latest = await getRitualById(id);
    if (latest && isRitualPayAlreadyClaimed(latest.status)) {
      const balance = await getRuneBalance(authed.profileUserId);
      return NextResponse.json(
        ritualPayAlreadyDonePayload(latest, balance, ritualToClient(latest))
      );
    }
    if (billingCharge && billingCharge.spentRunes > 0 && !billingCharge.deduplicated) {
      await BillingService.rollbackCharge({
        userId: authed.profileUserId,
        cost: billingCharge.spentRunes,
        wasFreeQuestion: false,
        actionType: "ritual",
        transactionId: billingCharge.transactionId,
      });
    }
    return NextResponse.json({ error: "Already paid or invalid status" }, { status: 409 });
  }

  const balance = await getRuneBalance(authed.profileUserId);

  return NextResponse.json({
    ok: true,
    status: "generating",
    ritual: ritualToClient(generating),
    balance,
  });
}
