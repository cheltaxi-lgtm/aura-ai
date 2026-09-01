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
import { isPalmReadingEnabled } from "@/lib/settings";
import { getClaimedPalmSnapshotRow } from "@/lib/services/palm-guest-service";
import {
  bindPalmChargeIdempotencyKey,
  getPalmChargeReuseState,
  listTodaysUnrefundedPalmSpends,
  palmSpendBelongsToSnapshot,
  palmSpendKeyForSnapshot,
  resolvePalmReadingPricing,
} from "@/lib/palm-reading-billing";
import { generatePalmFullReport } from "@/lib/palm-reading-prompts";
import {
  findPalmReadingEntry,
  findTodaysPaidPalmReport,
  palmCalendarDayKey,
  persistPalmReadingResult,
  withPalmReadingLock,
} from "@/lib/palm-reading-persist";
import type { PalmSnapshot } from "@/lib/palm-constants";
import { reportError } from "@/lib/error-report";

export const runtime = "nodejs";
export const maxDuration = 240;

function palmReportPayload(params: {
  report: string;
  snapshot: PalmSnapshot;
  snapshotId: string;
  historyId?: string;
  runeBalance?: number;
  firstPalmDiscount: boolean;
  cached?: boolean;
}) {
  return {
    report: params.report,
    snapshot: params.snapshot,
    snapshotId: params.snapshotId,
    historyId: params.historyId,
    runeBalance: params.runeBalance,
    firstPalmDiscount: params.firstPalmDiscount,
    cached: params.cached === true,
    saved: Boolean(params.historyId),
  };
}

export async function POST(request: NextRequest) {
  if (!(await isPalmReadingEnabled())) {
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
    const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "palm_report");
    if (rateLimited) return rateLimited;
  }

  let snapshotId = "";
  let clientIdempotencyKey: string | undefined;
  let asyncRequested = false;
  let rawBody: Record<string, unknown> = {};

  try {
    const body = await request.json();
    rawBody = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    asyncRequested = body.async === true;
    snapshotId = typeof body.snapshotId === "string" ? body.snapshotId.trim() : "";
    clientIdempotencyKey =
      request.headers.get("Idempotency-Key")?.trim() ||
      (typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!/^[0-9a-f-]{36}$/i.test(snapshotId)) {
    return NextResponse.json(
      { error: "SNAPSHOT_REQUIRED", message: "Сначала сделайте снимок ладони." },
      { status: 400 }
    );
  }

  const idempotencyKey = bindPalmChargeIdempotencyKey(snapshotId, clientIdempotencyKey);

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

  const stored = await getClaimedPalmSnapshotRow({ snapshotId, profileUserId });
  const snapshot = stored?.snapshot ?? null;
  if (!stored || !snapshot) {
    return NextResponse.json(
      {
        error: "SNAPSHOT_NOT_FOUND",
        message: "Снимок ладони не найден — сделайте фото снова.",
      },
      { status: 404 }
    );
  }

  const todaysPaid = await findTodaysPaidPalmReport(profileUserId);
  if (todaysPaid) {
    const payload = palmReportPayload({
      report: todaysPaid.report,
      snapshot: todaysPaid.snapshot ?? snapshot,
      snapshotId: todaysPaid.snapshotId ?? snapshotId,
      historyId: todaysPaid.historyId,
      firstPalmDiscount: todaysPaid.firstPalmDiscount,
      cached: true,
    });
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  }

  const unlimitedEarly = await resolveUnlimitedAccess({ accountId, profileUserId });
  const runeSettingsEarly = await getRuneSettings();
  const billingOn = isRuneBillingActive(profileUserId, unlimitedEarly, runeSettingsEarly);
  const earlySpends = billingOn ? await listTodaysUnrefundedPalmSpends(profileUserId) : [];
  if (billingOn && earlySpends.length > 0 && !palmSpendBelongsToSnapshot(earlySpends, snapshotId)) {
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
      kind: "palm_reading",
      payload: {
        ...rawBody,
        async: false,
        palmSnapshotId: snapshotId,
        snapshotId,
        idempotencyKey,
      },
      bypassDeliveryGate: true,
    });
  }

  return withPalmReadingLock(profileUserId, `day:${palmCalendarDayKey()}`, async () => {
    const unlimited = await resolveUnlimitedAccess({ accountId, profileUserId });
    const runeSettings = await getRuneSettings();
    const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);

    let billingCharge: BillingChargeResult | null = null;
    let spentRunes = 0;
    let runeBalance: number | undefined;
    let firstPalmDiscount = false;

    const existing = await findPalmReadingEntry(profileUserId, snapshotId, idempotencyKey);
    if (existing && typeof existing.context_data.report === "string") {
      const payload = palmReportPayload({
        report: existing.context_data.report,
        snapshot,
        snapshotId,
        historyId: existing.id,
        runeBalance,
        firstPalmDiscount: existing.context_data.firstPalmDiscount === true,
        cached: true,
      });
      await trackWorkerJobCompleted(request, payload);
      return NextResponse.json(payload);
    }

    const todaysInsideLock = await findTodaysPaidPalmReport(profileUserId);
    if (todaysInsideLock) {
      const payload = palmReportPayload({
        report: todaysInsideLock.report,
        snapshot: todaysInsideLock.snapshot ?? snapshot,
        snapshotId: todaysInsideLock.snapshotId ?? snapshotId,
        historyId: todaysInsideLock.historyId,
        runeBalance,
        firstPalmDiscount: todaysInsideLock.firstPalmDiscount,
        cached: true,
      });
      await trackWorkerJobCompleted(request, payload);
      return NextResponse.json(payload);
    }

    const spendsInside = useRuneBilling
      ? await listTodaysUnrefundedPalmSpends(profileUserId)
      : [];
    if (
      useRuneBilling &&
      spendsInside.length > 0 &&
      !palmSpendBelongsToSnapshot(spendsInside, snapshotId)
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
        const pricing = await resolvePalmReadingPricing(profileUserId);
        firstPalmDiscount = pricing.firstPalmDiscount;
        const charge = await BillingService.chargeForSession({
          userId: profileUserId,
          cost: pricing.effectiveCost,
          actionType: "PALM_READING",
          description: pricing.firstPalmDiscount
            ? "Гадание по ладони (первая скидка 50%)"
            : undefined,
          idempotencyKey,
        });
        runeBalance = charge.newBalance;
        await trackWorkerJobCharged(request, charge.transactionId);

        if (charge.deduplicated) {
          const existingAfterCharge = await findPalmReadingEntry(
            profileUserId,
            snapshotId,
            idempotencyKey
          );
          if (existingAfterCharge && typeof existingAfterCharge.context_data.report === "string") {
            const payload = palmReportPayload({
              report: existingAfterCharge.context_data.report,
              snapshot,
              snapshotId,
              historyId: existingAfterCharge.id,
              runeBalance,
              firstPalmDiscount,
              cached: true,
            });
            await trackWorkerJobCompleted(request, payload);
            return NextResponse.json(payload);
          }

          const priorState = charge.transactionId
            ? await getPalmChargeReuseState(profileUserId, charge.transactionId)
            : null;

          if (priorState && !priorState.refunded) {
            billingCharge = {
              spentRunes: priorState.amount,
              wasFreeQuestion: false,
              newBalance: charge.newBalance,
              actionType: "PALM_READING",
              slotReserved: false,
              transactionId: charge.transactionId,
            };
            spentRunes = priorState.amount;
          } else {
            const retryCharge = await BillingService.chargeForSession({
              userId: profileUserId,
              cost: pricing.effectiveCost,
              actionType: "PALM_READING",
              description: pricing.firstPalmDiscount
                ? "Гадание по ладони (первая скидка 50%)"
                : undefined,
              idempotencyKey: `${palmSpendKeyForSnapshot(snapshotId)}:${randomUUID()}`,
            });
            if (retryCharge.deduplicated) {
              throw new Error("palm_retry_charge_conflict");
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
            actionType: "PALM_READING",
          });
          runeBalance = rollback.balance;
          refunded = rollback.refunded;
          billingCharge = null;
          spentRunes = 0;
        } catch (refundErr) {
          console.error("[palm-report] refund failed:", refundErr);
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

    const userName = normalizePersonDisplayNameOr(profile?.name ?? accountName ?? "", "друг");

    let report: string | null;
    try {
      report = await generatePalmFullReport(snapshot, {
        userName,
        gender:
          profile?.gender === "male"
            ? "Мужской"
            : profile?.gender === "female"
              ? "Женский"
              : undefined,
        zodiac: profile?.zodiac,
      });
    } catch (error) {
      reportError(error, { route: "palm/report", userId: profileUserId });
      return refundAndFail("Palm report generation threw");
    }

    if (!report?.trim()) {
      return refundAndFail("Palm report generation failed");
    }

    if (!(await beginWorkerJobSave(request))) {
      return refundAndFail("Palm report save race");
    }

    const historyId = await persistPalmReadingResult({
      profileUserId,
      reportBody: report,
      snapshot,
      snapshotId,
      userName,
      isPaid: spentRunes > 0 || unlimited,
      spentRunes,
      idempotencyKey,
      firstPalmDiscount,
    });

    const payload = palmReportPayload({
      report,
      snapshot,
      snapshotId,
      historyId,
      runeBalance,
      firstPalmDiscount,
    });
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  });
}
