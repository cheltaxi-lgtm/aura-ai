import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import {
  createJointReadingInvite,
  buildJointReadingUrl,
  getActiveJointInviteForInitiator,
} from "@/lib/joint-reading-service";
import { query } from "@/lib/db";
import { getUserById } from "@/lib/users";
import type { SpreadId } from "@/lib/spreads";
import { normalizeSpreadId } from "@/lib/spreads";

export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const existing = !forceNew ? await getActiveJointInviteForInitiator(authed.profileUserId) : null;
  if (existing) {
    if (resolvedInitiatorName || resolvedPartnerName) {
      await query(
        `UPDATE joint_readings SET
           initiator_name = COALESCE($2, initiator_name),
           partner_name = COALESCE($3, partner_name)
         WHERE id = $1`,
        [existing.id, resolvedInitiatorName ?? null, resolvedPartnerName ?? null]
      );
    }
    return NextResponse.json({
      token: existing.token,
      url: buildJointReadingUrl(existing.token),
      expiresAt: existing.expires_at,
      reused: true,
    });
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
      expiresAt: invite.expires_at,
      reused: false,
    });
  } catch (err) {
    // Invite creation failed after we already charged runes for it — refund so
    // the user isn't billed for something that doesn't exist.
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
