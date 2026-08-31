import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { ensureDb } from "@/lib/db";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { requireUserAuth } from "@/lib/require-auth";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import { isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { normalizePersonDisplayNameOr } from "@/lib/normalize-person-name";
import {
  getAsyncJobWorkerUserId,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  beginWorkerJobSave,
  trackWorkerJobCharged,
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
} from "@/lib/async-job-lifecycle";
import { isAuraReadingEnabled } from "@/lib/settings";
import { getClaimedAuraSnapshot } from "@/lib/services/aura-guest-service";
import {
  auraSpendBelongsToSnapshot,
  getAuraChargeReuseState,
  listTodaysUnrefundedAuraSpends,
  resolveAuraReadingPricing,
} from "@/lib/aura-reading-billing";
import { generateAuraFullReport } from "@/lib/aura-reading-prompts";
import {
  auraCalendarDayKey,
  findAuraReadingEntry,
  findTodaysPaidAuraReport,
  persistAuraReadingResult,
  withAuraReadingLock,
} from "@/lib/aura-reading-persist";
import type { AuraSnapshot } from "@/lib/aura-constants";
import { reportError } from "@/lib/error-report";

export const runtime = "nodejs";
export const maxDuration = 240;

function auraReportPayload(params: {
  report: string;
  snapshot: AuraSnapshot;
  snapshotId: string;
  historyId?: string;
  runeBalance?: number;
  firstAuraDiscount: boolean;
  cached?: boolean;
}) {
  return {
    report: params.report,
    snapshot: params.snapshot,
    snapshotId: params.snapshotId,
    historyId: params.historyId,
    runeBalance: params.runeBalance,
    firstAuraDiscount: params.firstAuraDiscount,
    cached: params.cached === true,
    saved: Boolean(params.historyId),
  };
}

/**
 * Paid Aura report: charge runes → full premium reading from the CLAIMED
 * snapshot (never re-runs vision, never stores the photo).
 * Client path: async enqueue → poll /api/jobs/[id]. Worker path: async=false.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuraReadingEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  await ensureDb();

  const workerUserId = getAsyncJobWorkerUserId(request);
  let accountId: string;
  let accountName: string | undefined;

  if (workerUserId) {
    accountId = workerUserId;
  } else {
    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Требуется регистрация", code: "auth_required" },
        { status: 401 }
      );
    }
    accountId = auth.sub;
    accountName = auth.name;
    const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "aura_report");
    if (rateLimited) return rateLimited;
  }

  let snapshotId = "";
  let idempotencyKey: string | undefined;
  let asyncRequested = false;
  let rawBody: Record<string, unknown> = {};

  try {
    const body = await request.json();
    rawBody = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    asyncRequested = body.async === true;
    snapshotId = typeof body.snapshotId === "string" ? body.snapshotId.trim() : "";
    idempotencyKey =
      request.headers.get("Idempotency-Key")?.trim() ||
      (typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!/^[0-9a-f-]{36}$/i.test(snapshotId)) {
    return NextResponse.json(
      { error: "SNAPSHOT_REQUIRED", message: "Сначала сделайте снимок ауры." },
      { status: 400 }
    );
  }

  const profileUserId = workerUserId
    ? workerUserId
    : await getProfileUserIdForAccount(accountId);
  if (!profileUserId) {
    return NextResponse.json(
      { error: "Требуется регистрация", code: "auth_required" },
      { status: 401 }
    );
  }
  const profileRow = await getUserById(profileUserId);
  if (!profileRow || !isUserAgeEligible(profileRow)) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }
  const profile = serializeUserProfile(profileRow);

  // Ownership BEFORE enqueue: a foreign or unclaimed snapshot id can never
  // mint a reading — and must not even queue a job.
  const snapshot = await getClaimedAuraSnapshot({ snapshotId, profileUserId });
  if (!snapshot) {
    return NextResponse.json(
      {
        error: "SNAPSHOT_NOT_FOUND",
        message: "Снимок ауры не найден — сделайте фото снова.",
      },
      { status: 404 }
    );
  }

  const todaysPaid = await findTodaysPaidAuraReport(profileUserId);
  if (todaysPaid) {
    const payload = auraReportPayload({
      report: todaysPaid.report,
      snapshot: todaysPaid.snapshot ?? snapshot,
      snapshotId: todaysPaid.snapshotId ?? snapshotId,
      historyId: todaysPaid.historyId,
      firstAuraDiscount: todaysPaid.firstAuraDiscount,
      cached: true,
    });
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  }

  const unlimitedEarly = await resolveUnlimitedAccess({ accountId, profileUserId });
  const runeSettingsEarly = await getRuneSettings();
  const billingOn = isRuneBillingActive(profileUserId, unlimitedEarly, runeSettingsEarly);
  const earlySpends = billingOn ? await listTodaysUnrefundedAuraSpends(profileUserId) : [];
  if (
    billingOn &&
    earlySpends.length > 0 &&
    !auraSpendBelongsToSnapshot(earlySpends, snapshotId)
  ) {
    return NextResponse.json(
      {
        error: "ALREADY_PAID_TODAY",
        code: "ALREADY_PAID_TODAY",
        message:
          "Разбор на сегодня уже оплачен. Новый будет доступен завтра — руны не спишутся повторно.",
      },
      { status: 409 }
    );
  }

  if (asyncRequested && isAsyncJobWorkerConfigured() && !workerUserId) {
    return enqueuePaidAsyncJob({
      userId: profileUserId,
      kind: "aura_reading",
      payload: {
        ...rawBody,
        async: false,
        auraSnapshotId: snapshotId,
        idempotencyKey,
      },
      bypassDeliveryGate: true,
    });
  }

  return withAuraReadingLock(profileUserId, `day:${auraCalendarDayKey()}`, async () => {
  const unlimited = await resolveUnlimitedAccess({ accountId, profileUserId });
  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);

  let billingCharge: BillingChargeResult | null = null;
  let spentRunes = 0;
  let runeBalance: number | undefined;
  let firstAuraDiscount = false;

  // Dedupe: same snapshot already has a finished report → return cached, no re-charge.
  const existing = await findAuraReadingEntry(profileUserId, snapshotId, idempotencyKey);
  if (existing && typeof existing.context_data.report === "string") {
    const payload = auraReportPayload({
      report: existing.context_data.report,
      snapshot,
      snapshotId,
      historyId: existing.id,
      runeBalance,
      firstAuraDiscount: existing.context_data.firstAuraDiscount === true,
      cached: true,
    });
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  }

  const todaysInsideLock = await findTodaysPaidAuraReport(profileUserId);
  if (todaysInsideLock) {
    const payload = auraReportPayload({
      report: todaysInsideLock.report,
      snapshot: todaysInsideLock.snapshot ?? snapshot,
      snapshotId: todaysInsideLock.snapshotId ?? snapshotId,
      historyId: todaysInsideLock.historyId,
      runeBalance,
      firstAuraDiscount: todaysInsideLock.firstAuraDiscount,
      cached: true,
    });
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  }

  const spendsInside = useRuneBilling
    ? await listTodaysUnrefundedAuraSpends(profileUserId)
    : [];
  if (
    useRuneBilling &&
    spendsInside.length > 0 &&
    !auraSpendBelongsToSnapshot(spendsInside, snapshotId)
  ) {
    return NextResponse.json(
      {
        error: "ALREADY_PAID_TODAY",
        code: "ALREADY_PAID_TODAY",
        message:
          "Разбор на сегодня уже оплачен. Новый будет доступен завтра — руны не спишутся повторно.",
      },
      { status: 409 }
    );
  }

  if (useRuneBilling) {
    try {
      const pricing = await resolveAuraReadingPricing(profileUserId);
      firstAuraDiscount = pricing.firstAuraDiscount;
      const charge = await BillingService.chargeForSession({
        userId: profileUserId,
        cost: pricing.effectiveCost,
        actionType: "AURA_READING",
        description: pricing.firstAuraDiscount
          ? "Аура по фото (первая скидка 50%)"
          : undefined,
        idempotencyKey: idempotencyKey || `aura-reading:${snapshotId}`,
      });
      runeBalance = charge.newBalance;
      await trackWorkerJobCharged(request, charge.transactionId);

      if (charge.deduplicated) {
        const existingAfterCharge = await findAuraReadingEntry(
          profileUserId,
          snapshotId,
          idempotencyKey
        );
        if (existingAfterCharge && typeof existingAfterCharge.context_data.report === "string") {
          const payload = auraReportPayload({
            report: existingAfterCharge.context_data.report,
            snapshot,
            snapshotId,
            historyId: existingAfterCharge.id,
            runeBalance,
            firstAuraDiscount,
            cached: true,
          });
          await trackWorkerJobCompleted(request, payload);
          return NextResponse.json(payload);
        }

        // No finished report for the prior charge. Either the previous attempt
        // crashed after charging (charge still held → reuse it, never double-spend)
        // or it failed and was refunded (money returned → charge again under a
        // fresh per-attempt key, otherwise the stable key dead-ends the retry).
        const priorState = charge.transactionId
          ? await getAuraChargeReuseState(profileUserId, charge.transactionId)
          : null;

        if (priorState && !priorState.refunded) {
          billingCharge = {
            spentRunes: priorState.amount,
            wasFreeQuestion: false,
            newBalance: charge.newBalance,
            actionType: "AURA_READING",
            slotReserved: false,
            transactionId: charge.transactionId,
          };
          spentRunes = priorState.amount;
        } else {
          const retryCharge = await BillingService.chargeForSession({
            userId: profileUserId,
            cost: pricing.effectiveCost,
            actionType: "AURA_READING",
            description: pricing.firstAuraDiscount
              ? "Аура по фото (первая скидка 50%)"
              : undefined,
            idempotencyKey: `aura-reading:${snapshotId}:${randomUUID()}`,
          });
          if (retryCharge.deduplicated) {
            // Fresh per-attempt key cannot collide — defensive only.
            throw new Error("aura_retry_charge_conflict");
          }
          billingCharge = retryCharge;
          runeBalance = retryCharge.newBalance;
          spentRunes = retryCharge.spentRunes;
          await trackWorkerJobCharged(request, retryCharge.transactionId);
        }
      } else {
        billingCharge = charge;
        spentRunes = charge.spentRunes;
      }
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        return insufficientFundsResponse(err);
      }
      throw err;
    }
  }

  const refundAndFail = async (message: string) => {
    let refunded = false;
    if (billingCharge) {
      try {
        const rollback = await BillingService.rollbackChargeEx({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: billingCharge.wasFreeQuestion,
          transactionId: billingCharge.transactionId,
          actionType: "AURA_READING",
        });
        runeBalance = rollback.balance;
        refunded = rollback.refunded;
        billingCharge = null;
        spentRunes = 0;
      } catch (refundErr) {
        console.error("[aura-report] refund failed:", refundErr);
      }
    }
    await trackWorkerJobFailed(request, message, {
      refunded,
      errorCode: "generation_failed",
    });
    return NextResponse.json(
      {
        error: refunded
          ? "Не удалось получить разбор. Руны возвращены. Попробуйте ещё раз."
          : "Не удалось получить разбор. Попробуйте ещё раз — списанные руны вернутся автоматически.",
        code: "generation_failed",
        refunded,
        runeBalance,
      },
      { status: 502 }
    );
  };

  const userName = normalizePersonDisplayNameOr(profile?.name ?? accountName, "друг");

  let report: string | null;
  try {
    report = await generateAuraFullReport(snapshot, {
      userName,
      gender:
        profile?.gender === "male" ? "Мужской" : profile?.gender === "female" ? "Женский" : undefined,
      zodiac: profile?.zodiac,
    });
  } catch (error) {
    reportError(error, { route: "aura/report", userId: profileUserId });
    return refundAndFail("Aura report generation threw");
  }

  if (!report?.trim()) {
    return refundAndFail("Aura report generation failed");
  }

  if (!(await beginWorkerJobSave(request))) {
    return refundAndFail("Aura report save race");
  }

  const historyId = await persistAuraReadingResult({
    profileUserId,
    reportBody: report,
    snapshot,
    snapshotId,
    userName,
    isPaid: spentRunes > 0 || unlimited,
    spentRunes,
    idempotencyKey,
    firstAuraDiscount,
  });

  const payload = auraReportPayload({
    report,
    snapshot,
    snapshotId,
    historyId,
    runeBalance,
    firstAuraDiscount,
  });
  await trackWorkerJobCompleted(request, payload);
  return NextResponse.json(payload);
  });
}
