import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { createHash } from "node:crypto";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import {
  getAsyncJobWorkerUserId,
  getAsyncJobIdFromRequest,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  chargeRuneActionForCurrentWorkerJob,
  refundWorkerJobCharge,
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
  trackWorkerJobRefunded,
} from "@/lib/async-job-lifecycle";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { isJointReadingEnabled } from "@/lib/settings";
import {
  BillingService,
  ConfirmedCostExceededError,
  InsufficientFundsError,
  insufficientFundsResponse,
  CHARGE_IDEM_WINDOW_SEC,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import {
  buildJointReadingUrl,
  reconcileActiveJointInviteForCreation,
} from "@/lib/joint-reading-service";
import { createJointReadingInviteReceipt } from "@/lib/services/joint-reading-receipt";
import { recoverSavedWorkerReport } from "@/lib/services/durable-report-receipt";
import { getReportWorkerJobFromRequest } from "@/lib/async-job-worker-auth";
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
  let confirmedCost: number | undefined;

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
    if (body.confirmedCost !== undefined) {
      if (typeof body.confirmedCost !== "number" || !Number.isSafeInteger(body.confirmedCost) || body.confirmedCost < 0 || body.confirmedCost > 1_000_000) {
        return NextResponse.json({ error: "Invalid confirmed cost" }, { status: 400 });
      }
      confirmedCost = body.confirmedCost;
    }
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
  const operation = getAsyncJobIdFromRequest(request) ?? idempotencyKey ??
    String(Math.floor(Date.now() / (CHARGE_IDEM_WINDOW_SEC * 1000)));
  const purchaseKey = `joint-create:${createHash("sha256").update(JSON.stringify([partnerKey, operation])).digest("hex").slice(0, 40)}`;
  if (workerUserId) {
    const recovered = await recoverSavedWorkerReport(authed.profileUserId,getReportWorkerJobFromRequest(request));
    if (recovered) return NextResponse.json({...recovered,reused:true});
  }

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
      charge = await chargeRuneActionForCurrentWorkerJob({ request, params: {
        userId: authed.profileUserId,
        action: "JOINT_READING",
        hasFullAccess: false,
        maxCost: confirmedCost,
        idempotencyKey: purchaseKey,
        operationIdentity: purchaseKey,
      } });
    }
  } catch (err) {
    if (err instanceof ConfirmedCostExceededError) {
      return NextResponse.json({ error: "Стоимость изменилась. Проверьте цену и повторите попытку.", actualCost: err.actual }, { status: 409 });
    }
    if (err instanceof InsufficientFundsError) {
      return insufficientFundsResponse(err);
    }
    throw err;
  }

  let inviteSaved = false;
  try {
    // A paid purchase uses its ledger UUID. Exempt purchases use a deterministic
    // UUID v5 scoped to this owner and accepted operation, without a ledger row.
    const digest = createHash("sha1")
      .update(Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex"))
      .update(JSON.stringify([authed.profileUserId, purchaseKey])).digest("hex").slice(0, 32);
    const exemptId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${
      ((parseInt(digest[16], 16) & 3) | 8).toString(16)}${digest.slice(17, 20)}-${digest.slice(20)}`;
    const payload = await createJointReadingInviteReceipt({ request,transactionId:charge?.transactionId,params: {
      id: charge?.transactionId ?? exemptId,
      initiatorUserId: authed.profileUserId,
      initiatorName: resolvedInitiatorName,
      partnerName: resolvedPartnerName,
      spreadId,
      intentSlug,
      reuseExisting: false,
      runeCharged: Boolean(charge),
    } });
    inviteSaved = true;

    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  } catch (err) {
    let actuallyRefunded=false;
    if (charge && !inviteSaved) {
      const rollback=await refundWorkerJobCharge(request, {
        userId: authed.profileUserId,
        cost: charge.spentRunes,
        wasFreeQuestion: charge.wasFreeQuestion,
        actionType: "JOINT_READING",
        transactionId: charge.transactionId,
      }).catch((rollbackErr) => {
        console.error("Joint reading invite rune rollback failed:", rollbackErr);
      });
      actuallyRefunded=rollback?.refunded===true;
      if(actuallyRefunded)await trackWorkerJobRefunded(request);
    }
    await trackWorkerJobFailed(request, "Joint reading create failed", {
      refunded: actuallyRefunded,
      errorCode: "generation_failed",
    });
    throw err;
  }
}
