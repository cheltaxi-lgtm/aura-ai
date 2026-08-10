import { NextRequest, NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { isHumanDesignEnabled } from "@/lib/settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isHardRejectedLlmOutput, isOpenRouterConfigured } from "@/lib/llm";
import { completeHdCompositeReport } from "@/lib/human-design/report-generate";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
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
  trackWorkerJobRefunded,
} from "@/lib/async-job-lifecycle";
import { query, withTransaction } from "@/lib/db";
import {
  attachCompositeReportTransaction,
  completeCompositeReport,
  createPendingCompositeReport,
  deleteCompositeReportRow,
  failCompositeReport,
  findDuplicateDoneCompositeReport,
  getHdChartById,
  getHdCompositeReport,
  hasRuneRefundForTransaction,
  HD_UUID_RE,
  isStalePendingComposite,
  lockStalePendingCompositeForResume,
  mapHdRelationToSelf,
  markCompositeReportChargeRefunded,
  releaseStalePendingCompositeLock,
  toPublicHdCompositeReport,
  type HdCompositeReportRow,
} from "@/lib/services/human-design-service";
import {
  buildHdCompositeReportSystemPrompt,
  connectionRelationPromptHint,
  formatHdConnectionEvidence,
  HD_CONNECTION_RELATIONS,
  HD_ENGINE_VERSION,
  sanitizeHdCompositeReportText,
  type HdConnectionRelation,
} from "@/lib/human-design";
import { getUserById } from "@/lib/users";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";

export const maxDuration = 600;

// Plain text only — markdown italics (*…*) leave a trailing `*` that fails HD V5 junk gate.
const DISCLAIMER =
  "\n\n---\nРазбор является символической интерпретацией системы Дизайна Человека и не заменяет профессиональную консультацию.";

const RELATION_IDS = new Set(HD_CONNECTION_RELATIONS.map((r) => r.id));

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

  const baseChartId = request.nextUrl.searchParams.get("baseChartId") ?? "";
  const partnerChartId = request.nextUrl.searchParams.get("partnerChartId") ?? "";
  if (!HD_UUID_RE.test(baseChartId) || !HD_UUID_RE.test(partnerChartId)) {
    return NextResponse.json({ report: null });
  }

  const report = await getHdCompositeReport(baseChartId, partnerChartId, resolved.profileUserId);
  if (!report) return NextResponse.json({ report: null });
  const pub = toPublicHdCompositeReport(report);
  if (pub.reportText) {
    pub.reportText = sanitizeHdCompositeReportText(pub.reportText);
  }
  return NextResponse.json({ report: pub });
}

export async function POST(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  // Durable worker calls carry the user id in worker headers and skip the
  // per-user rate limit — the job queue is the limiter there.
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
    baseChartId?: unknown;
    partnerChartId?: unknown;
    aiDataUseAcknowledged?: unknown;
    relation?: unknown;
    regenerate?: unknown;
    async?: unknown;
  };
  // Free rebuild removed from product — one report per paid pair.
  if (body.regenerate === true) {
    return NextResponse.json(
      { error: "Пересборка разбора недоступна. Уже оплаченный текст остаётся как есть." },
      { status: 400 }
    );
  }
  if (body.aiDataUseAcknowledged !== true) {
    return NextResponse.json(
      { error: "Подтвердите передачу рассчитанных данных карт внешней языковой модели." },
      { status: 400 }
    );
  }
  if (
    typeof body.baseChartId !== "string" ||
    typeof body.partnerChartId !== "string" ||
    !HD_UUID_RE.test(body.baseChartId) ||
    !HD_UUID_RE.test(body.partnerChartId)
  ) {
    return NextResponse.json({ error: "Укажите обе карты." }, { status: 400 });
  }
  if (body.baseChartId === body.partnerChartId) {
    return NextResponse.json({ error: "Выберите две разные карты." }, { status: 400 });
  }

  const base = await getHdChartById(body.baseChartId);
  const partner = await getHdChartById(body.partnerChartId);
  if (!base || !partner || base.userId !== userId || partner.userId !== userId) {
    return NextResponse.json({ error: "Карты не найдены." }, { status: 404 });
  }
  if (base.engineVersion !== HD_ENGINE_VERSION || partner.engineVersion !== HD_ENGINE_VERSION) {
    return NextResponse.json(
      { error: "Карта рассчитана устаревшим движком. Пересчитайте карту." },
      { status: 409 }
    );
  }

  // Prefer explicit body, else stored relation on the partner (other) chart.
  const bodyRelation =
    typeof body.relation === "string" && RELATION_IDS.has(body.relation as HdConnectionRelation)
      ? (body.relation as HdConnectionRelation)
      : null;
  const relation: HdConnectionRelation =
    bodyRelation ?? mapHdRelationToSelf(partner.relationToSelf) ?? "partner";

  let existing = await getHdCompositeReport(base.id, partner.id, userId);

  if (existing?.status === "done" && existing.reportText) {
    const payload = {
      report: {
        ...toPublicHdCompositeReport(existing),
        reportText: sanitizeHdCompositeReportText(existing.reportText),
      },
      cached: true,
    };
    // No-op on plain client calls; completes the job on worker requeues.
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  }
  if (existing?.status === "pending" && !isStalePendingComposite(existing)) {
    return NextResponse.json(
      { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
      { status: 409 }
    );
  }
  // Stale pending with a recorded charge → crashed after payment: resume
  // generation on the same row without charging twice.
  let resumePaidPending =
    existing?.status === "pending" &&
    isStalePendingComposite(existing) &&
    Boolean(existing.transactionId);

  if (resumePaidPending && existing?.transactionId) {
    // Barrier against refunded orphans: if the charge behind this row was
    // already returned (rollback raced a crash), resuming would be a FREE
    // generation. Drop the row and fall into the normal paid flow.
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
      await deleteCompositeReportRow(existing.id).catch(() => undefined);
      existing = null;
      resumePaidPending = false;
    }
  }

  // Legacy/crash path: error row with an UNREFUNDED charge. Deleting it would
  // orphan the spend and double-charge on retry — convert to a paid resume.
  if (!resumePaidPending && existing?.status === "error" && existing.transactionId) {
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
        `UPDATE hd_composite_reports SET status = 'pending', error = NULL,
           created_at = now() - make_interval(secs => 601), updated_at = now()
         WHERE id = $1 AND status = 'error'
         RETURNING id`,
        [existing.id]
      );
      if (!rows[0]) {
        return NextResponse.json(
          { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
          { status: 409 }
        );
      }
      existing = (await getHdCompositeReport(base.id, partner.id, userId)) ?? existing;
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
    if (!resumePaidPending) {
      try {
        await ensureSufficientRunes({ userId, action: "HD_COMPOSITE_REPORT", exempt });
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
      kind: "hd_composite_report",
      payload: {
        baseChartId: base.id,
        partnerChartId: partner.id,
        relation,
        aiDataUseAcknowledged: true,
      },
      // HD has its own module kill-switch (isHumanDesignEnabled above).
      bypassDeliveryGate: true,
    });
  }

  // Normalize at the prompt boundary too — rows stored before the storage-side
  // normalization may still carry raw input (prompt-injection surface).
  const partnerName =
    partner.subjectKind === "other" && partner.subjectName
      ? normalizePersonDisplayName(partner.subjectName) || "Партнёр"
      : "Партнёр";
  const clientName =
    base.subjectKind === "other" && base.subjectName
      ? normalizePersonDisplayName(base.subjectName) || null
      : normalizePersonDisplayName(profileRow.name) || null;

  const evidence = formatHdConnectionEvidence(
    base.chart,
    partner.chart,
    { a: clientName ?? "первый человек", b: partnerName },
    relation,
    { a: base.placeName, b: partner.placeName }
  );

  let charge: BillingChargeResult | undefined;
  let rollbackAttempted = false;
  let refundLanded = false;
  let completed = false;
  let pending: HdCompositeReportRow | null = null;
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
      // Money went back → the pending row must NEVER be resumable (a resumable
      // row with a refunded charge is a free generation 10 minutes later).
      await markCompositeReportChargeRefunded(pending.id);
    }
    if (res.refunded) {
      await trackWorkerJobRefunded(request);
    }
  };

  try {
    if (resumePaidPending && existing) {
      // CAS-lock the stale row: concurrent resumes see a fresh pending → 409.
      const locked = await lockStalePendingCompositeForResume(existing.id);
      if (!locked) {
        return NextResponse.json(
          { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
          { status: 409 }
        );
      }
      pending = existing;
    } else {
      // error / unpaid stale pending → start over (its charge was rolled back).
      if (existing) await deleteCompositeReportRow(existing.id);

      // Double-billing guard: the same two people under new chart ids are
      // the same product — serve the already-paid text, no second charge.
      if (base.chart.birth && partner.chart.birth) {
        const dupe = await findDuplicateDoneCompositeReport({
          userId,
          excludeBaseChartId: base.id,
          excludePartnerChartId: partner.id,
          base: {
            birthDate: base.chart.birth.date,
            birthTime: base.chart.birth.time,
            timezone: base.chart.timezone ?? "",
            subjectName: base.subjectName,
          },
          partner: {
            birthDate: partner.chart.birth.date,
            birthTime: partner.chart.birth.time,
            timezone: partner.chart.timezone ?? "",
            subjectName: partner.subjectName,
          },
        });
        if (dupe?.reportText) {
          const payload = {
            report: {
              ...toPublicHdCompositeReport(dupe),
              reportText: sanitizeHdCompositeReportText(dupe.reportText),
            },
            cached: true,
            deduped: true,
          };
          await trackWorkerJobCompleted(request, payload);
          return NextResponse.json(payload);
        }
      }

      // Atomic: pending row + charge + transaction link commit or roll back
      // together — a crash can leave neither a paid orphan nor an unpaid charge.
      const created = await withTransaction(async (client) => {
        const row = await createPendingCompositeReport(
          {
            baseChartId: base.id,
            partnerChartId: partner.id,
            userId,
            transactionId: null,
          },
          client
        );
        if (!row) return null;
        const c = await chargeRuneAction({
          userId,
          action: "HD_COMPOSITE_REPORT",
          exempt,
          client,
        });
        await attachCompositeReportTransaction(row.id, c.transactionId ?? null, client);
        return { row, charge: c };
      });
      if (!created) {
        const again = await getHdCompositeReport(base.id, partner.id, userId);
        if (again?.status === "done" && again.reportText) {
          return NextResponse.json({
            report: {
              ...toPublicHdCompositeReport(again),
              reportText: sanitizeHdCompositeReportText(again.reportText),
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

    const scenario = connectionRelationPromptHint(relation);
    const answer = await completeHdCompositeReport({
      systemPrompt: await wrapSystemPrompt(
        buildHdCompositeReportSystemPrompt(clientName, partnerName, scenario)
      ),
      evidence,
      nameA: clientName ?? "первый человек",
      nameB: partnerName,
    });

    // Section gate already ran in completeHdCompositeReport; only hard-reject
    // CJK/refusal — chat degenerate heuristics false-positive on practices.
    if (!answer || isHardRejectedLlmOutput(answer)) {
      await rollback();
      if (resumePaidPending) {
        // Keep the paid pending row: the next attempt resumes it for free.
        // Release the CAS-lock age reset so the retry isn't blocked for 10 min.
        await releaseStalePendingCompositeLock(pending.id).catch(() => undefined);
        await trackWorkerJobFailed(
          request,
          "Модель не смогла подготовить разбор. Попробуйте ещё раз — оплата сохранена.",
          { errorCode: "empty_or_rejected" }
        );
        return NextResponse.json(
          { error: "Модель не смогла подготовить разбор. Попробуйте ещё раз — оплата сохранена." },
          { status: 502 }
        );
      }
      if (refundLanded) {
        // Refund confirmed — the row may terminalize; retry starts clean.
        await failCompositeReport(pending.id, "empty_or_rejected");
      } else {
        // Refund failed: keep pending so a retry RESUMES on the same charge
        // instead of deleting the row and charging twice.
        await releaseStalePendingCompositeLock(pending.id).catch(() => undefined);
      }
      await trackWorkerJobFailed(
        request,
        refundLanded
          ? "Модель не смогла подготовить разбор. Оплата возвращена."
          : "Модель не смогла подготовить разбор. Оплата сохранена — попробуйте ещё раз, повторного списания не будет.",
        { refunded: refundLanded, errorCode: "empty_or_rejected" }
      );
      return NextResponse.json(
        {
          error: refundLanded
            ? "Модель не смогла подготовить разбор. Оплата возвращена."
            : "Модель не смогла подготовить разбор. Оплата сохранена — попробуйте ещё раз, повторного списания не будет.",
          refunded: refundLanded,
        },
        { status: 502 }
      );
    }

    const text = sanitizeHdCompositeReportText(answer) + DISCLAIMER;
    // Win against the worker timeout-refund before persisting the paid text.
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
    await completeCompositeReport(pending.id, text, "openrouter");
    completed = true; // past this point a catch must NOT refund a done report
    const done = await getHdCompositeReport(base.id, partner.id, userId);
    const payload = {
      report: done
        ? {
            ...toPublicHdCompositeReport(done),
            reportText: done.reportText
              ? sanitizeHdCompositeReportText(done.reportText)
              : done.reportText,
          }
        : null,
      cached: false,
      runeBalance: charge?.newBalance,
    };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  } catch (error) {
    // Never refund a report that actually completed — a post-completion
    // failure (e.g. the final SELECT) must not turn into a free report.
    if (!completed) {
      await rollback().catch(() => {
        console.warn("[human-design] composite rollback failed");
      });
      if (resumePaidPending && pending) {
        await releaseStalePendingCompositeLock(pending.id).catch(() => undefined);
      }
    }
    // A failed create+charge transaction rolled back atomically — no unpaid
    // placeholder to clean up, the next attempt starts clean.
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
    console.warn("[human-design] composite report failed");
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
