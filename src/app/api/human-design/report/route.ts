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
import {
  claimHdChart,
  completeHdReport,
  createPendingHdReport,
  failHdReport,
  getHdChartById,
  getHdReportForChart,
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
  if (typeof body.chartId !== "string" || body.chartId.length < 10) {
    return NextResponse.json({ error: "Укажите карту." }, { status: 400 });
  }

  let chart = await getHdChartById(body.chartId);
  if (!chart) {
    return NextResponse.json({ error: "Карта не найдена." }, { status: 404 });
  }
  // Unowned guest chart → first authenticated purchase attaches it (same rule as /claim).
  if (!chart.userId) {
    await claimHdChart(chart.fingerprint, userId);
    chart = await getHdChartById(body.chartId);
  }
  if (!chart || chart.userId !== userId) {
    return NextResponse.json({ error: "Карта не найдена." }, { status: 404 });
  }
  if (chart.engineVersion !== HD_ENGINE_VERSION) {
    return NextResponse.json(
      { error: "Карта рассчитана устаревшим движком. Пересчитайте карту." },
      { status: 409 }
    );
  }

  const existing = await getHdReportForChart(chart.id, userId);
  if (existing?.status === "done" && existing.reportText) {
    return NextResponse.json({ report: existing, cached: true });
  }
  if (existing?.status === "pending") {
    return NextResponse.json(
      { error: "Разбор уже генерируется. Обновите страницу через минуту.", code: "CLAIM_BUSY" },
      { status: 409 }
    );
  }

  if (!isOpenRouterConfigured()) {
    return NextResponse.json({ error: "Генерация временно недоступна." }, { status: 503 });
  }

  const user = await getUserById(userId).catch(() => null);
  const clientName =
    chart.subjectKind === "other" && chart.subjectName
      ? chart.subjectName
      : normalizePersonDisplayName(user?.name) || null;
  const evidence = formatHdEvidence(chart.chart);
  const systemPrompt = await wrapSystemPrompt(buildHdReportSystemPrompt(clientName));

  const unlimited = await resolveUnlimitedAccess({ profileUserId: userId });
  const runeSettings = await getRuneSettings();
  const exempt = !isRuneBillingActive(userId, unlimited, runeSettings);

  let charge: BillingChargeResult | undefined;
  let rollbackAttempted = false;
  const rollback = async () => {
    if (!charge || rollbackAttempted) return;
    rollbackAttempted = true;
    await BillingService.rollbackCharge({
      userId,
      cost: charge.spentRunes,
      wasFreeQuestion: charge.wasFreeQuestion,
      transactionId: charge.transactionId,
      actionType: charge.actionType,
      slotReserved: charge.slotReserved,
    });
  };

  try {
    charge = await chargeRuneAction({ userId, action: "HD_REPORT", exempt });

    // Idempotency: the unique chart_id index rejects a concurrent second purchase.
    const pending = await createPendingHdReport({
      chartId: chart.id,
      userId,
      transactionId: charge.transactionId ?? null,
    });
    if (!pending) {
      await rollback();
      const raced = await getHdReportForChart(chart.id, userId);
      if (raced?.status === "done") {
        return NextResponse.json({ report: raced, cached: true, refunded: true });
      }
      return NextResponse.json(
        { error: "Разбор уже генерируется. Оплата возвращена.", refunded: true },
        { status: 409 }
      );
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
      await failHdReport(pending.id, "invalid_model_output");
      return NextResponse.json(
        { error: "Модель не смогла создать разбор. Оплата возвращена.", refunded: true },
        { status: 502 }
      );
    }

    const reportText = text.trim() + REPORT_DISCLAIMER;
    await completeHdReport(pending.id, reportText, "openrouter");
    if (chart.subjectKind === "self") {
      rememberHdChartFact(userId, chart.chart, chart.id);
    }

    const report = await getHdReportForChart(chart.id, userId);
    return NextResponse.json({ report, runeBalance: charge.newBalance });
  } catch (error) {
    await rollback().catch(() => {
      console.warn("[human-design] billing rollback failed");
    });
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
      { error: "Ошибка генерации разбора.", refunded: rollbackAttempted },
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
  const report = await getHdReportForChart(chartId, resolved.profileUserId);
  return NextResponse.json({ report });
}
