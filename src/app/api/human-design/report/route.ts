import { NextRequest, NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { isHumanDesignEnabled } from "@/lib/settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isOpenRouterConfigured, isRejectedLlmOutput } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { getRuneSettings } from "@/lib/rune-settings";
import { isRuneBillingActive } from "@/lib/rune-service";
import {
  BillingService,
  chargeRuneAction,
  InsufficientFundsError,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import { withTransaction } from "@/lib/db";
import {
  attachHdReportTransaction,
  beginHdReportRewrite,
  completeHdReport,
  createPendingHdReport,
  deleteHdReportRow,
  failHdReport,
  getHdChartById,
  getHdReportForChart,
  hasRuneRefundForTransaction,
  HD_UUID_RE,
  isStalePendingReport,
  lockStalePendingReportForResume,
  markHdReportChargeRefunded,
  releaseStalePendingReportLock,
  restoreHdReportDone,
  toPublicHdReport,
  updateHdReportTone,
  type HdReportRow,
  type HdReportToneId,
} from "@/lib/services/human-design-service";
import {
  buildHdReportSystemPrompt,
  completeHdFullReport,
  formatHdEvidence,
  HD_ENGINE_VERSION,
  sanitizeHdReportText,
  type HdReportTone,
} from "@/lib/human-design";
import { getUserById } from "@/lib/users";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { rememberHdChartFact } from "@/lib/human-design/memory";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";

/** Multi-pass full decrypt can take several LLM calls. */
export const maxDuration = 600;

const REPORT_DISCLAIMER =
  "\n\n---\n*Разбор является символической интерпретацией системы Дизайна Человека и не заменяет профессиональную консультацию.*";

const INCLUDED_ASKS = 5;

export async function POST(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }
  const userId = resolved.profileUserId;

  const rateLimited = await enforcePaidRouteRateLimit(userId, "hd_report");
  if (rateLimited) return rateLimited;

  const profileRow = await getUserById(userId).catch(() => null);
  if (!profileRow || !isUserAgeEligible(profileRow)) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    chartId?: unknown;
    aiDataUseAcknowledged?: unknown;
    regenerate?: unknown;
    tone?: unknown;
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
  const regenerate = body.regenerate === true;
  const toneRaw = typeof body.tone === "string" ? body.tone : "personal";
  const tone: HdReportToneId =
    toneRaw === "child" || toneRaw === "work" ? toneRaw : "personal";
  const toneHint: HdReportTone = tone;

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

  if (regenerate) {
    if (!existing || existing.status !== "done" || !existing.reportText) {
      return NextResponse.json(
        { error: "Сначала получите разбор — пересобрать пока нечего." },
        { status: 400 }
      );
    }
  } else if (existing?.status === "done" && existing.reportText) {
    return NextResponse.json({
      report: {
        ...toPublicHdReport(existing),
        reportText: sanitizeHdReportText(existing.reportText),
      },
      cached: true,
    });
  }

  if (!regenerate && existing?.status === "pending" && !isStalePendingReport(existing)) {
    return NextResponse.json(
      { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
      { status: 409 }
    );
  }

  // Stale pending with a recorded charge → crashed after payment: resume
  // generation on the same row without charging twice.
  let resumePaidPending =
    !regenerate &&
    existing?.status === "pending" &&
    isStalePendingReport(existing) &&
    Boolean(existing.transactionId);

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

  if (!isOpenRouterConfigured()) {
    return NextResponse.json({ error: "Генерация временно недоступна." }, { status: 503 });
  }

  const clientName =
    chart.subjectKind === "other" && chart.subjectName
      ? normalizePersonDisplayName(chart.subjectName) || null
      : normalizePersonDisplayName(profileRow.name) || null;
  const evidence = formatHdEvidence(chart.chart);
  const systemPrompt = await wrapSystemPrompt(
    buildHdReportSystemPrompt(clientName, toneHint)
  );

  const unlimited = await resolveUnlimitedAccess({ profileUserId: userId });
  const runeSettings = await getRuneSettings();
  const exempt = !isRuneBillingActive(userId, unlimited, runeSettings);

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
  };

  try {
    if (regenerate && existing) {
      const locked = await beginHdReportRewrite(existing.id);
      if (!locked) {
        return NextResponse.json(
          { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
          { status: 409 }
        );
      }
      await updateHdReportTone(existing.id, tone).catch(() => undefined);
      pending = existing;
    } else if (resumePaidPending && existing) {
      const locked = await lockStalePendingReportForResume(existing.id);
      if (!locked) {
        return NextResponse.json(
          { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
          { status: 409 }
        );
      }
      pending = existing;
    } else {
      if (existing) await deleteHdReportRow(existing.id);

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

    const text = await completeHdFullReport({
      systemPrompt,
      evidence,
      clientName,
    });

    if (!text || isRejectedLlmOutput(text)) {
      await rollback();
      if (regenerate && pending) {
        await restoreHdReportDone(pending.id).catch(() => undefined);
        return NextResponse.json(
          { error: "Не удалось пересобрать разбор. Предыдущий текст сохранён — попробуйте ещё раз." },
          { status: 502 }
        );
      }
      if (resumePaidPending) {
        await releaseStalePendingReportLock(pending.id).catch(() => undefined);
        return NextResponse.json(
          { error: "Модель не смогла создать разбор. Попробуйте ещё раз — оплата сохранена." },
          { status: 502 }
        );
      }
      await failHdReport(pending.id, "invalid_model_output");
      return NextResponse.json(
        {
          error: refundLanded
            ? "Модель не смогла создать разбор. Оплата возвращена."
            : "Модель не смогла создать разбор. Если руны списались, они вернутся автоматически.",
          refunded: refundLanded,
        },
        { status: 502 }
      );
    }

    const reportText = sanitizeHdReportText(text) + REPORT_DISCLAIMER;
    await completeHdReport(pending.id, reportText, "openrouter");
    completed = true;
    if (chart.subjectKind === "self") {
      rememberHdChartFact(userId, chart.chart, chart.id);
    }

    const report = await getHdReportForChart(chart.id, userId);
    return NextResponse.json({
      report: report
        ? {
            ...toPublicHdReport(report),
            reportText: report.reportText
              ? sanitizeHdReportText(report.reportText)
              : report.reportText,
          }
        : null,
      runeBalance: charge?.newBalance,
      regenerated: regenerate,
    });
  } catch (error) {
    if (!completed) {
      await rollback().catch(() => {
        console.warn("[human-design] billing rollback failed");
      });
      if (regenerate && pending) {
        await restoreHdReportDone(pending.id).catch(() => undefined);
      } else if (resumePaidPending && pending) {
        await releaseStalePendingReportLock(pending.id).catch(() => undefined);
      }
    }
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
    console.warn("[human-design] report failed");
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
