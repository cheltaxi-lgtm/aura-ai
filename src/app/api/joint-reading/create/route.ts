import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import {
  getAsyncJobWorkerUserId,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  trackWorkerJobCharged,
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
  trackWorkerJobRefunded,
} from "@/lib/async-job-lifecycle";
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
import { normalizeStoredDisplayName } from "@/lib/normalize-person-name";
import type { SpreadId } from "@/lib/spreads";
import { normalizeSpreadId } from "@/lib/spreads";

export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }

  const workerUserId = getAsyncJobWorkerUserId(request);
  let authed: { auth: { sub: string }; profileUserId: string };
  if (workerUserId) {
    authed = { auth: { sub: workerUserId }, profileUserId: workerUserId };
  } else {
    const profileCtx = await resolveProfileUserContext();
    if (!profileCtx.ok) {
      return profileAuthFailureResponse(profileCtx.reason);
    }
    authed = {
      auth: profileCtx.auth,
      profileUserId: profileCtx.profileUserId,
    };
  }

  if (!workerUserId) {
    const rateLimited = await enforcePaidRouteRateLimit(
      authed.profileUserId,
      "joint_reading_create"
    );
    if (rateLimited) return rateLimited;
  }

  if (!(await isJointReadingEnabled())) {
    return NextResponse.json(
      { error: "Совместные расклады временно отключены." },
      { status: 403 }
    );
  }

  let initiatorName: string | undefined;
  let partnerName: string | undefined;
  let spreadId: SpreadId = "love-7";
  let intentSlug = "sovmestimost-pary";
  let forceNew = false;
  let asyncRequested = false;
  let rawBody: Record<string, unknown> = {};
  let idempotencyKey: string | undefined;

  try {
    const body = await request.json();
    rawBody = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    asyncRequested = body.async === true;
    initiatorName = typeof body.initiatorName === "string" ? body.initiatorName : undefined;
    partnerName = typeof body.partnerName === "string" ? body.partnerName : undefined;
    if (typeof body.spreadId === "string") spreadId = normalizeSpreadId(body.spreadId);
    if (typeof body.intentSlug === "string") intentSlug = body.intentSlug.trim().slice(0, 80);
    forceNew = body.forceNew === true;
    idempotencyKey =
      typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 80) : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const profile = await getUserById(authed.profileUserId);
  const resolvedInitiatorName =
    normalizeStoredDisplayName(initiatorName?.trim() || profile?.name, "").slice(0, 40) ||
    undefined;
  const resolvedPartnerName = partnerName?.trim()
    ? normalizeStoredDisplayName(partnerName, partnerName.trim()).slice(0, 40)
    : undefined;

  const partnerKey = [
    spreadId,
    intentSlug,
    resolvedInitiatorName ?? "",
    resolvedPartnerName ?? "",
    forceNew ? "force" : "reuse",
  ].join("|");

  if (asyncRequested && isAsyncJobWorkerConfigured() && !workerUserId) {
    return enqueuePaidAsyncJob({
      userId: authed.profileUserId,
      kind: "joint_reading",
      payload: {
        ...rawBody,
        async: false,
        partnerKey,
        idempotencyKey: idempotencyKey || partnerKey,
      },
      bypassDeliveryGate: true,
    });
  }

  if (!forceNew) {
    const reconciled = await reconcileActiveJointInviteForCreation({
      userId: authed.profileUserId,
      spreadId,
      intentSlug,
      initiatorName: resolvedInitiatorName,
      partnerName: resolvedPartnerName,
    });
    if (reconciled.row && !reconciled.createFresh) {
      const payload = {
        token: reconciled.row.token,
        url: buildJointReadingUrl(reconciled.row.token),
        intentSlug: reconciled.row.intent_slug,
        spreadId: reconciled.row.spread_id,
        expiresAt: reconciled.row.expires_at,
        reused: true,
        configUpdated: reconciled.configUpdated,
      };
      await trackWorkerJobCompleted(request, payload);
      return NextResponse.json(payload);
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
      await trackWorkerJobCharged(request, charge.transactionId);
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

    const payload = {
      token: invite.token,
      url: buildJointReadingUrl(invite.token),
      intentSlug: invite.intent_slug,
      spreadId: invite.spread_id,
      expiresAt: invite.expires_at,
      reused: false,
      configUpdated: false,
    };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
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
      await trackWorkerJobRefunded(request);
    }
    await trackWorkerJobFailed(request, "Joint reading create failed", {
      refunded: Boolean(charge),
      errorCode: "generation_failed",
    });
    throw err;
  }
}
