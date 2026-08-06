import { NextRequest, NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { isHumanDesignEnabled } from "@/lib/settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { completeChat, isOpenRouterConfigured, isRejectedLlmOutput } from "@/lib/llm";
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
  toPublicHdReport,
} from "@/lib/services/human-design-service";
import {
  buildHdReportSystemPrompt,
  formatHdEvidence,
  HD_ENGINE_VERSION,
} from "@/lib/human-design";
import { getUserById } from "@/lib/users";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { rememberHdChartFact } from "@/lib/human-design/memory";

export const maxDuration = 300;

const REPORT_DISCLAIMER =
  "\n\n---\n*Разбор является символической интерпретацией системы Дизайна Человека и не заменяет профессиональную консультацию.*";

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

  const body = (await request.json().catch(() => ({}))) as {
    chartId?: unknown;
    aiDataUseAcknowledged?: unknown;
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
    return NextResponse.json({ report: toPublicHdReport(existing), cached: true });
  }
  if (existing?.status === "pending" && !isStalePendingReport(existing)) {
    return NextResponse.json(
      { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
      { status: 409 }
    );
  }
  // Stale pending with a recorded charge → the process crashed AFTER payment:
  // resume generation on the same row without charging twice.
  let resumePaidPending =
    existing?.status === "pending" &&
    isStalePendingReport(existing) &&
    Boolean(existing.transactionId);

  if (resumePaidPending && existing?.transactionId) {
    // Barrier against refunded orphans: if the charge behind this row was
    // already returned (rollback raced a crash), resuming would be a FREE
    // generation. Drop the row and fall into the normal paid flow.
    const alreadyRefunded = await hasRuneRefundForTransaction(existing.transactionId).catch(() => false);
    if (alreadyRefunded) {
      await deleteHdReportRow(existing.id).catch(() => undefined);
      existing = null;
      resumePaidPending = false;
    }
  }

  if (!isOpenRouterConfigured()) {
    return NextResponse.json({ error: "Генерация временно недоступна." }, { status: 503 });
  }

  const user = await getUserById(userId).catch(() => null);
  // Normalize legacy rows too — subjectName is interpolated into the prompt.
  const clientName =
    chart.subjectKind === "other" && chart.subjectName
      ? normalizePersonDisplayName(chart.subjectName) || null
      : normalizePersonDisplayName(user?.name) || null;
  const evidence = formatHdEvidence(chart.chart);
  const systemPrompt = await wrapSystemPrompt(buildHdReportSystemPrompt(clientName));

  const unlimited = await resolveUnlimitedAccess({ profileUserId: userId });
  const runeSettings = await getRuneSettings();
  const exempt = !isRuneBillingActive(userId, unlimited, runeSettings);

  let charge: BillingChargeResult | undefined;
  let rollbackAttempted = false;
  let refundLanded = false;
  let completed = false;
  let pending: { id: string } | null = null;
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
      await markHdReportChargeRefunded(pending.id);
    }
  };

  try {
    if (resumePaidPending && existing) {
      // CAS-lock the stale row: concurrent resumes see a fresh pending → 409.
      const locked = await lockStalePendingReportForResume(existing.id);
      if (!locked) {
        return NextResponse.json(
          { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
          { status: 409 }
        );
      }
      pending = existing;
    } else {
      // error / unpaid stale pending → start over (its charge was rolled back).
      if (existing) await deleteHdReportRow(existing.id);

      // Atomic: pending row + charge + transaction link commit or roll back
      // together — a crash can leave neither a paid orphan nor an unpaid charge.
      const created = await withTransaction(async (client) => {
        const row = await createPendingHdReport(
          { chartId: chart.id, userId, transactionId: null },
          client
        );
        if (!row) return null;
        const c = await chargeRuneAction({ userId, action: "HD_REPORT", exempt, client });
        await attachHdReportTransaction(row.id, c.transactionId ?? null, client);
        return { row, charge: c };
      });
      if (!created) {
        const raced = await getHdReportForChart(chart.id, userId);
        if (raced?.status === "done") {
          return NextResponse.json({ report: toPublicHdReport(raced), cached: true });
        }
        return NextResponse.json(
          { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
          { status: 409 }
        );
      }
      pending = created.row;
      charge = created.charge;
    }

    const text = await completeChat({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `РАСЧЁТНЫЕ ДАННЫЕ:\n${evidence}\n\nНапиши полный разбор для ${clientName ?? "клиента"}.`,
        },
      ],
      maxTokens: 6000,
      temperature: 0.7,
      isPaid: true,
      timeoutMs: 240_000,
    });

    if (!text || isRejectedLlmOutput(text)) {
      await rollback();
      if (resumePaidPending) {
        // Keep the paid pending row: the next attempt resumes it for free.
        // Release the CAS-lock age reset so the retry isn't blocked for 10 min.
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

    const reportText = text.trim() + REPORT_DISCLAIMER;
    await completeHdReport(pending.id, reportText, "openrouter");
    completed = true; // past this point a catch must NOT refund a done report
    if (chart.subjectKind === "self") {
      rememberHdChartFact(userId, chart.chart, chart.id);
    }

    const report = await getHdReportForChart(chart.id, userId);
    return NextResponse.json({
      report: report ? toPublicHdReport(report) : null,
      runeBalance: charge?.newBalance,
    });
  } catch (error) {
    // Never refund a report that actually completed — a post-completion
    // failure (e.g. the final SELECT) must not turn into a free report.
    if (!completed) {
      await rollback().catch(() => {
        console.warn("[human-design] billing rollback failed");
      });
      if (resumePaidPending && pending) {
        // Release CAS age reset so the next retry isn't blocked for 10 min.
        await releaseStalePendingReportLock(pending.id).catch(() => undefined);
      }
    }
    // A failed create+charge transaction rolled back atomically — no unpaid
    // placeholder to clean up, the next attempt starts clean.
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
  return NextResponse.json({ report: report ? toPublicHdReport(report) : null });
}
