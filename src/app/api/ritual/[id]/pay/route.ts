import { NextRequest, NextResponse } from "next/server";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { ensureDb, queryClient, withTransaction } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  BillingIdempotencyConflictError,
  billingIdempotencyConflictResponse,
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
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
  const legacyKey = readRequestChargeIdempotencyKey(request);

  try {
    return await withTransaction(async (client) => {
      // Same lock order as billing and account erasure. The debit and claimed
      // ritual are committed together, including competing pay/retry requests.
      await queryClient(client, "SELECT id FROM users WHERE id=$1 FOR UPDATE", [authed.profileUserId]);
      await queryClient(client, "SELECT id FROM rituals WHERE id=$1 AND user_id=$2 FOR UPDATE", [id, authed.profileUserId]);
      const current = await getRitualById(id, client);
      if (!current || current.user_id !== authed.profileUserId) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (isRitualPayAlreadyClaimed(current.status)) {
        const balance = await getRuneBalance(authed.profileUserId, client);
        return NextResponse.json(ritualPayAlreadyDonePayload(current, balance, ritualToClient(current)));
      }
      if (current.status !== "payment") return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      let billingCharge: BillingChargeResult | null = null;
      if (useBilling && current.rune_cost > 0) {
        const label = RITUAL_TYPES[current.ritual_type].label;
        billingCharge = await BillingService.chargeForSession({
          userId: authed.profileUserId,
          cost: current.rune_cost,
          actionType: "ritual",
          description: `Обряд: ${label}`,
          // The server ritual UUID always identifies the purchase.
          idempotencyKey: `ritual-pay:${current.id}`,
          operationIdentity: `ritual-pay:${current.id}`,
          legacyIdempotencyKeys: legacyKey ? [legacyKey] : [],
          client,
        });
      }
      const generating = await markRitualPaidAndGenerating(id, {
        paymentStatus: billingCharge ? "paid" : "free",
        transactionId: billingCharge?.transactionId ?? null,
        client,
      });
      if (!generating) throw new Error("ritual_payment_claim_lost");
      const balance = await getRuneBalance(authed.profileUserId, client);
      return NextResponse.json({
        ok: true, status: "generating", ritual: ritualToClient(generating), balance,
      });
    });
  } catch (err) {
    if (err instanceof InsufficientFundsError) return insufficientFundsResponse(err);
    if (err instanceof BillingIdempotencyConflictError) return billingIdempotencyConflictResponse();
    throw err;
  }
}
