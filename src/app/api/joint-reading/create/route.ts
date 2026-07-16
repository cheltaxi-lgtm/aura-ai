import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { isJointReadingEnabled } from "@/lib/settings";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import {
  createJointReadingInvite,
  buildJointReadingUrl,
  reconcileActiveJointInviteForCreation,
} from "@/lib/joint-reading-service";
import { getUserById } from "@/lib/users";
import type { SpreadId } from "@/lib/spreads";
import { normalizeSpreadId } from "@/lib/spreads";

export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(authed.profileUserId, "joint_reading_create");
  if (rateLimited) return rateLimited;

  if (!(await isJointReadingEnabled())) {
    return NextResponse.json({ error: "Совместные расклады временно отключены." }, { status: 403 });
  }

  let initiatorName: string | undefined;
  let partnerName: string | undefined;
  let spreadId: SpreadId = "love-7";
  let intentSlug = "sovmestimost-pary";
  let forceNew = false;

  try {
    const body = await request.json();
    initiatorName = typeof body.initiatorName === "string" ? body.initiatorName : undefined;
    partnerName = typeof body.partnerName === "string" ? body.partnerName : undefined;
    if (typeof body.spreadId === "string") spreadId = normalizeSpreadId(body.spreadId);
    if (typeof body.intentSlug === "string") intentSlug = body.intentSlug.trim().slice(0, 80);
    forceNew = body.forceNew === true;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const profile = await getUserById(authed.profileUserId);
  const resolvedInitiatorName =
    initiatorName?.trim().slice(0, 40) || profile?.name?.trim().slice(0, 40) || undefined;
  const resolvedPartnerName = partnerName?.trim().slice(0, 40) || undefined;

  if (!forceNew) {
    const reconciled = await reconcileActiveJointInviteForCreation({
      userId: authed.profileUserId,
      spreadId,
      intentSlug,
      initiatorName: resolvedInitiatorName,
      partnerName: resolvedPartnerName,
    });
    if (reconciled.row && !reconciled.createFresh) {
      return NextResponse.json({
        token: reconciled.row.token,
        url: buildJointReadingUrl(reconciled.row.token),
        intentSlug: reconciled.row.intent_slug,
        spreadId: reconciled.row.spread_id,
        expiresAt: reconciled.row.expires_at,
        reused: true,
        configUpdated: reconciled.configUpdated,
      });
    }
  }

  const hasAccess = await resolveUnlimitedAccess({
    accountId: authed.auth.sub,
    profileUserId: authed.profileUserId,
  });

  let charge: BillingChargeResult | null = null;
  try {
    if (!hasAccess) {
      charge = await BillingService.chargeRuneAction({
        userId: authed.profileUserId,
        action: "JOINT_READING",
        hasFullAccess: false,
      });
    }
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return insufficientFundsResponse(err);
    }
    throw err;
  }

  try {
    const invite = await createJointReadingInvite({
      initiatorUserId: authed.profileUserId,
      initiatorName: resolvedInitiatorName,
      partnerName: resolvedPartnerName,
      spreadId,
      intentSlug,
      reuseExisting: false,
      runeCharged: Boolean(charge),
    });

    return NextResponse.json({
      token: invite.token,
      url: buildJointReadingUrl(invite.token),
      intentSlug: invite.intent_slug,
      spreadId: invite.spread_id,
      expiresAt: invite.expires_at,
      reused: false,
      configUpdated: false,
    });
  } catch (err) {
    if (charge) {
      await BillingService.rollbackCharge({
        userId: authed.profileUserId,
        cost: charge.spentRunes,
        wasFreeQuestion: charge.wasFreeQuestion,
        actionType: "JOINT_READING",
      }).catch((rollbackErr) => {
        console.error("Joint reading invite rune rollback failed:", rollbackErr);
      });
    }
    throw err;
  }
}
