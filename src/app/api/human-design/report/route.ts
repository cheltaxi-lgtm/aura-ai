import { NextRequest, NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { isHumanDesignEnabled } from "@/lib/settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isHardRejectedLlmOutput, isOpenRouterConfigured } from "@/lib/llm";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { getRuneSettings } from "@/lib/rune-settings";
import { isRuneBillingActive } from "@/lib/rune-service";
import {
  BillingService,
  chargeRuneAction,
  ensureSufficientRunes,
  InsufficientFundsError,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import {
  getAsyncJobWorkerUserId,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  beginWorkerJobSave,
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
  trackWorkerJobNeedsRegeneration,
  trackWorkerJobRefunded,
} from "@/lib/async-job-lifecycle";
import { query, withTransaction } from "@/lib/db";
import {
  attachHdReportTransaction,
  completeHdReport,
  createPendingHdReport,
  deleteHdReportRow,
  failHdReport,
  findDuplicateDoneHdReport,
  getHdChartById,
  getHdReportForChart,
  hasRuneRefundForTransaction,
  HD_UUID_RE,
  isStalePendingReport,
  lockPendingReportForWorkerResume,
  lockStalePendingReportForResume,
  markHdReportChargeRefunded,
  markHdReportNeedsRegeneration,
  releaseStalePendingReportLock,
  toPublicHdReport,
  type HdReportRow,
  type HdReportToneId,
} from "@/lib/services/human-design-service";
import { HD_ENGINE_VERSION, sanitizeHdReportText } from "@/lib/human-design";
import { generateHdReportSectional } from "@/lib/hd-report-pipeline/generate";
import { isHdSectionalReportEnabled } from "@/lib/hd-report-pipeline/flags";
import { completeHdFullReport } from "@/lib/human-design/report-generate";
import { buildHdReportSystemPrompt, formatHdEvidence } from "@/lib/human-design/prompt";
import { getUserById } from "@/lib/users";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { rememberHdChartFact } from "@/lib/human-design/memory";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";

/** Sectional HD report: one call per section + editor. */
export const maxDuration = 800;

const REPORT_DISCLAIMER =
  "\n\n---\n*Разбор является символической интерпретацией системы Дизайна Человека и не заменяет профессиональную консультацию.*";

const INCLUDED_ASKS = 5;

export async function POST(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  // Durable worker calls carry the user id in worker headers (loopback +
  // secret, gated by middleware) and skip the per-user rate limit — the job
  // queue is the limiter there.
  const workerUserId = getAsyncJobWorkerUserId(request);
  let userId: string;
  if (workerUserId) {
    userId = workerUserId;
  } else {
    const resolved = await resolveProfileUserContext();
    if (!resolved.ok) {
      return profileAuthFailureResponse(resolved.reason);
    }
    userId = resolved.profileUserId;

    const rateLimited = await enforcePaidRouteRateLimit(userId, "hd_report");
    if (rateLimited) return rateLimited;
  }

  const profileRow = await getUserById(userId).catch(() => null);
  if (!profileRow || !isUserAgeEligible(profileRow)) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    chartId?: unknown;
    aiDataUseAcknowledged?: unknown;
    regenerate?: unknown;
    tone?: unknown;
    async?: unknown;
  };
  if (body.aiDataUseAcknowledged !== true) {
    return NextResponse.json(
      { error: "Подтвердите передачу рассчитанных данных карты внешней языковой модели." },
      { status: 400 }
    );
  }
  if (typeof body.chartId !== "string" || !HD_UUID_RE.test(body.chartId)) {
    return NextResponse.json({ error: "Укажите карту." }, { status: 400 });
  }
  // Free rebuild / tone variants removed from product — one personal report per purchase.
  if (body.regenerate === true) {
    return NextResponse.json(
      { error: "Пересборка разбора недоступна. Уже оплаченный текст остаётся как есть." },
      { status: 400 }
    );
  }
  const tone: HdReportToneId = "personal";

  const chart = await getHdChartById(body.chartId);
  // Strict ownership: guest-pool charts are claimable only via the claim token
  // (client runs the claim flow on login before the purchase).
  if (!chart || chart.userId !== userId) {
    return NextResponse.json({ error: "Карта не найдена." }, { status: 404 });
  }
  if (chart.engineVersion !== HD_ENGINE_VERSION) {
    return NextResponse.json(
      { error: "Карта рассчитана устаревшим движком. Пересчитайте карту." },
      { status: 409 }
    );
  }

  let existing = await getHdReportForChart(chart.id, userId);

  if (existing?.status === "done" && existing.reportText) {
    const payload = {
      report: {
        ...toPublicHdReport(existing),
        reportText: sanitizeHdReportText(existing.reportText),
      },
      cached: true,
    };
    // No-op on plain client calls; completes the job on worker requeues.
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  }

  // Fresh pending: clients must back off (poll UI). Workers must NOT 409 —
  // after deploy/requeue the same pending is still "fresh" and CLAIM_BUSY
  // permanently kills the job while the UI spins forever.
  if (existing?.status === "pending" && !isStalePendingReport(existing) && !workerUserId) {
    return NextResponse.json(
      { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
      { status: 409 }
    );
  }

  // Stale pending with a recorded charge → crashed after payment: resume
  // generation on the same row without charging twice.
  // Worker requeue: also resume a still-fresh pending (see above).
  let resumePaidPending =
    existing?.status === "pending" &&
    (isStalePendingReport(existing) || Boolean(workerUserId)) &&
    Boolean(existing.transactionId);

  // Worker found an empty pending without a charge (crash before attach) —
  // drop it so generation can recreate cleanly instead of CLAIM_BUSY-looping.
  if (
    workerUserId &&
    existing?.status === "pending" &&
    !existing.transactionId &&
    !existing.reportText
  ) {
    await deleteHdReportRow(existing.id).catch(() => undefined);
    existing = null;
  }

  if (resumePaidPending && existing?.transactionId) {
    let alreadyRefunded: boolean;
    try {
      alreadyRefunded = await hasRuneRefundForTransaction(existing.transactionId);
    } catch {
      return NextResponse.json(
        { error: "Не удалось проверить статус оплаты. Попробуйте через минуту." },
        { status: 503 }
      );
    }
    if (alreadyRefunded) {
      await deleteHdReportRow(existing.id).catch(() => undefined);
      existing = null;
      resumePaidPending = false;
    }
  }

  // Legacy/crash / quality-gate path: error or needs_regeneration with an
  // UNREFUNDED charge. Deleting would orphan the spend and double-charge.
  if (
    !resumePaidPending &&
    existing &&
    (existing.status === "error" || existing.status === "needs_regeneration") &&
    existing.transactionId
  ) {
    let alreadyRefunded: boolean;
    try {
      alreadyRefunded = await hasRuneRefundForTransaction(existing.transactionId);
    } catch {
      return NextResponse.json(
        { error: "Не удалось проверить статус оплаты. Попробуйте через минуту." },
        { status: 503 }
      );
    }
    if (!alreadyRefunded) {
      const { rows } = await query(
        `UPDATE hd_reports SET status = 'pending', error = NULL,
           created_at = now() - make_interval(secs => 601), updated_at = now()
         WHERE id = $1 AND status IN ('error', 'needs_regeneration')
         RETURNING id`,
        [existing.id]
      );
      if (!rows[0]) {
        return NextResponse.json(
          { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
          { status: 409 }
        );
      }
      existing = (await getHdReportForChart(chart.id, userId)) ?? existing;
      resumePaidPending = true;
    }
    // alreadyRefunded → fall through: delete + fresh charge is safe.
  }

  if (!isOpenRouterConfigured()) {
    return NextResponse.json({ error: "Генерация временно недоступна." }, { status: 503 });
  }

  const unlimited = await resolveUnlimitedAccess({ profileUserId: userId });
  const runeSettings = await getRuneSettings();
  const exempt = !isRuneBillingActive(userId, unlimited, runeSettings);

  // Durable async delivery: hand generation to the worker queue. The same
  // route with async:false is the worker execution path — every billing,
  // resume and dedupe invariant above re-runs there unchanged. Balance is
  // pre-checked so a broke user gets the 402 paywall immediately instead of
  // a silent job failure the entity poll cannot surface.
  if (body.async === true && isAsyncJobWorkerConfigured()) {
    // Paid resume already charged — never 402 a broke user off a held row.
    // needs_regeneration / error with transaction_id are converted to
    // resumePaidPending above, so this also covers free quality retries.
    if (!resumePaidPending) {
      try {
        await ensureSufficientRunes({ userId, action: "HD_REPORT", exempt });
      } catch (error) {
        if (error instanceof InsufficientFundsError) {
          return NextResponse.json(
            {
              error: "insufficient_runes",
              message: "Недостаточно рун для этого действия.",
              balance: error.balance,
              required: error.required,
              cost: error.required,
            },
            { status: 402 }
          );
        }
        throw error;
      }
    }
    return enqueuePaidAsyncJob({
      userId,
      kind: "hd_report",
      payload: { chartId: chart.id, aiDataUseAcknowledged: true },
      // HD has its own module kill-switch (isHumanDesignEnabled above).
      bypassDeliveryGate: true,
    });
  }

  const aboutOther = chart.subjectKind === "other";
  const clientName =
    aboutOther && chart.subjectName
      ? normalizePersonDisplayName(chart.subjectName) || null
      : normalizePersonDisplayName(profileRow.name) || null;
  const useSectional = isHdSectionalReportEnabled();
  const legacySystemPrompt = useSectional
    ? null
    : buildHdReportSystemPrompt(clientName, "personal", { aboutOther });
  const legacyEvidence = useSectional ? null : formatHdEvidence(chart.chart);

  let charge: BillingChargeResult | undefined;
  let rollbackAttempted = false;
  let refundLanded = false;
  let completed = false;
  let pending: HdReportRow | { id: string } | null = null;
  const rollback = async () => {
    if (!charge || rollbackAttempted) return;
    rollbackAttempted = true;
    const res = await BillingService.rollbackChargeEx({
      userId,
      cost: charge.spentRunes,
      wasFreeQuestion: charge.wasFreeQuestion,
      transactionId: charge.transactionId,
      actionType: charge.actionType,
      slotReserved: charge.slotReserved,
    });
    refundLanded = res.refunded;
    if (res.refunded && pending) {
      await markHdReportChargeRefunded(pending.id);
    }
    if (res.refunded) {
      await trackWorkerJobRefunded(request);
    }
  };

  try {
    if (resumePaidPending && existing) {
      const locked = workerUserId
        ? await lockPendingReportForWorkerResume(existing.id)
        : await lockStalePendingReportForResume(existing.id);
      if (!locked) {
        return NextResponse.json(
          { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
          { status: 409 }
        );
      }
      pending = existing;
    } else {
      if (existing) await deleteHdReportRow(existing.id);

      // Double-billing guard: identical birth data under a new chart id is
      // the same product — serve the already-paid text, no second charge.
      if (chart.chart.birth) {
        const dupe = await findDuplicateDoneHdReport({
          userId,
          excludeChartId: chart.id,
          birthDate: chart.chart.birth.date,
          birthTime: chart.chart.birth.time,
          timezone: chart.chart.timezone ?? "",
          subjectKind: chart.subjectKind,
          subjectName: chart.subjectName,
        });
        if (dupe?.reportText) {
          const payload = {
            report: {
              ...toPublicHdReport(dupe),
              reportText: sanitizeHdReportText(dupe.reportText),
            },
            cached: true,
            deduped: true,
          };
          await trackWorkerJobCompleted(request, payload);
          return NextResponse.json(payload);
        }
      }

      const created = await withTransaction(async (client) => {
        const row = await createPendingHdReport(
          {
            chartId: chart.id,
            userId,
            transactionId: null,
            packageId: "max",
            includedAsksRemaining: INCLUDED_ASKS,
            reportTone: tone,
          },
          client
        );
        if (!row) return null;
        const c = await chargeRuneAction({ userId, action: "HD_REPORT", exempt, client });
        await attachHdReportTransaction(row.id, c.transactionId ?? null, client);
        return { row, charge: c };
      });
      if (!created) {
        const raced = await getHdReportForChart(chart.id, userId);
        if (raced?.status === "done" && raced.reportText) {
          return NextResponse.json({
            report: {
              ...toPublicHdReport(raced),
              reportText: sanitizeHdReportText(raced.reportText),
            },
            cached: true,
          });
        }
        return NextResponse.json(
          { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
          { status: 409 }
        );
      }
      pending = created.row;
      charge = created.charge;
    }

    // Rollback flag: HD_SECTIONAL_REPORT=0 → legacy multi-pass path.
    const generated = useSectional
      ? await generateHdReportSectional({
          chart: chart.chart,
          clientName,
          aboutOther,
          maxSectionRetries: 2,
        })
      : null;
    const legacyText = useSectional
      ? null
      : await completeHdFullReport({
          systemPrompt: legacySystemPrompt!,
          evidence: legacyEvidence!,
          clientName,
          aboutOther,
        });
    const text = generated ? generated.text : legacyText;

    // Hard-reject empty/CJK/refusal. Quality-gate failures keep the charge
    // and park the draft as needs_regeneration (no client delivery).
    if (!text || isHardRejectedLlmOutput(text)) {
      await rollback();
      if (resumePaidPending) {
        await releaseStalePendingReportLock(pending.id).catch(() => undefined);
        await trackWorkerJobFailed(
          request,
          "Модель не смогла создать разбор. Попробуйте ещё раз — оплата сохранена.",
          { errorCode: "invalid_model_output" }
        );
        return NextResponse.json(
          { error: "Модель не смогла создать разбор. Попробуйте ещё раз — оплата сохранена." },
          { status: 502 }
        );
      }
      if (refundLanded) {
        await failHdReport(pending.id, "invalid_model_output");
      } else {
        await releaseStalePendingReportLock(pending.id).catch(() => undefined);
      }
      await trackWorkerJobFailed(
        request,
        refundLanded
          ? "Модель не смогла создать разбор. Оплата возвращена."
          : "Модель не смогла создать разбор. Оплата сохранена — попробуйте ещё раз, повторного списания не будет.",
        { refunded: refundLanded, errorCode: "invalid_model_output" }
      );
      return NextResponse.json(
        {
          error: refundLanded
            ? "Модель не смогла создать разбор. Оплата возвращена."
            : "Модель не смогла создать разбор. Оплата сохранена — попробуйте ещё раз, повторного списания не будет.",
          refunded: refundLanded,
        },
        { status: 502 }
      );
    }

    if (generated?.needsRegeneration) {
      // Do NOT refund — runes stay spent; retry resumes free via transaction_id.
      await markHdReportNeedsRegeneration(
        pending.id,
        sanitizeHdReportText(text),
        generated.quality.findings
      );
      await trackWorkerJobNeedsRegeneration(
        request,
        "Разбор требует проверки качества. Оплата сохранена — повторного списания не будет."
      );
      return NextResponse.json(
        {
          error:
            "Разбор проходит проверку качества. Попробуйте позже — повторного списания не будет.",
          code: "needs_regeneration",
          refunded: false,
        },
        { status: 502 }
      );
    }

    const reportText = sanitizeHdReportText(text) + REPORT_DISCLAIMER;
    // Win against the worker timeout-refund: after save_claimed the reaper
    // can no longer fail this job out from under the completed report.
    if (!(await beginWorkerJobSave(request))) {
      await rollback();
      await trackWorkerJobFailed(
        request,
        "Генерация была отменена по таймауту. Оплата возвращена.",
        { refunded: refundLanded, errorCode: "job_timeout" }
      );
      return NextResponse.json(
        { error: "Генерация была отменена по таймауту. Оплата возвращена.", refunded: refundLanded },
        { status: 409 }
      );
    }
    await completeHdReport(
      pending.id,
      reportText,
      generated?.modelId || "openrouter",
      {
        costRub: generated?.costRub ?? null,
        llmCalls: generated?.llmCalls ?? null,
        tokenUsage: generated?.usage ?? null,
        qualityFindings: generated?.quality.findings ?? [],
      }
    );
    completed = true;
    console.warn("[hd-report] cost", {
      sectional: useSectional,
      costRub: generated?.costRub,
      llmCalls: generated?.llmCalls,
      usage: generated?.usage,
      modelId: generated?.modelId,
      durationMs: generated?.durationMs,
    });
    if (chart.subjectKind === "self") {
      rememberHdChartFact(userId, chart.chart, chart.id);
    }

    const report = await getHdReportForChart(chart.id, userId);
    const payload = {
      report: report
        ? {
            ...toPublicHdReport(report),
            reportText: report.reportText
              ? sanitizeHdReportText(report.reportText)
              : report.reportText,
          }
        : null,
      runeBalance: charge?.newBalance,
    };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (!completed) {
      await rollback().catch(() => {
        console.warn("[human-design] billing rollback failed");
      });
      if (resumePaidPending && pending) {
        await releaseStalePendingReportLock(pending.id).catch(() => undefined);
      }
    }
    if (error instanceof InsufficientFundsError) {
      await trackWorkerJobFailed(request, "Недостаточно рун для этого действия.", {
        errorCode: "insufficient_runes",
      });
      return NextResponse.json(
        {
          error: "insufficient_runes",
          message: "Недостаточно рун для этого действия.",
          balance: error.balance,
          required: error.required,
          cost: error.required,
        },
        { status: 402 }
      );
    }
    console.warn("[human-design] report failed");
    await trackWorkerJobFailed(request, "Ошибка генерации разбора.", {
      refunded: refundLanded,
      errorCode: "generation_failed",
    });
    return NextResponse.json(
      { error: "Ошибка генерации разбора.", refunded: refundLanded },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  const rateLimited = await enforcePaidRouteRateLimit(resolved.profileUserId, "hd_chart_read");
  if (rateLimited) return rateLimited;

  const chartId = request.nextUrl.searchParams.get("chartId") ?? "";
  if (!HD_UUID_RE.test(chartId)) {
    return NextResponse.json({ report: null });
  }
  const report = await getHdReportForChart(chartId, resolved.profileUserId);
  if (!report) return NextResponse.json({ report: null });
  const pub = toPublicHdReport(report);
  if (pub.reportText) {
    pub.reportText = sanitizeHdReportText(pub.reportText);
  }
  return NextResponse.json({ report: pub });
}
