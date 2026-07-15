import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { BillingService, InsufficientFundsError } from "@/lib/services/billing-service";
import { buildNatalEvidence, formatEvidencePrompt } from "@/lib/natal/evidence";
import {
  buildNatalReportJsonInstructions,
  natalReportToPlainText,
} from "@/lib/natal/report";
import { generateValidatedNatalReport } from "@/lib/natal/generate-validated-report";
import { parseTimingHorizon } from "@/lib/natal/timing";
import {
  claimNatalInterpretationResilient,
  getOrComputeNatalChart,
  releaseNatalInterpretationClaim,
  saveCurrentNatalInterpretation,
} from "@/lib/services/natal-chart-service";
import { getOrComputePersonalTiming } from "@/lib/services/natal-timing-service";
import type { ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { needsProfileResponse, requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { getUserById } from "@/lib/users";

export const maxDuration = 300;

const FORECAST_METADATA_DEFAULTS = {
  disclaimer:
    "Астрологический прогноз является символической интерпретацией вероятных тем и не гарантирует событий, не заменяет медицинскую, юридическую или финансовую консультацию.",
  methodology:
    "Прогноз построен по рассчитанным транзитам, солнечному возвращению и вторичным прогрессиям выбранного периода. Каждый вывод связан с указанными timing evidence; натальные положения используются только как дополнительный контекст.",
};

export async function POST(request: NextRequest) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await requireProfileUserId();
  if (!auth) return needsProfileResponse();
  const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "natal_forecast");
  if (limited) return limited;

  const body = await request.json().catch(() => ({})) as {
    horizon?: unknown;
    aiDataUseAcknowledged?: unknown;
  };
  const horizon = parseTimingHorizon(String(body.horizon ?? ""));
  if (!horizon) {
    return NextResponse.json({ error: "Выберите горизонт: 7, 30, 90 или 365 дней." }, { status: 400 });
  }
  if (body.aiDataUseAcknowledged !== true) {
    return NextResponse.json(
      { error: "Подтвердите передачу рассчитанных астрологических данных внешней языковой модели." },
      { status: 400 }
    );
  }

  let chart;
  let timing;
  try {
    chart = await getOrComputeNatalChart(auth.profileUserId);
    timing = await getOrComputePersonalTiming(auth.profileUserId, horizon)
      .then((result) => result.timing);
  } catch {
    return NextResponse.json(
      { error: "Не удалось подготовить расчёт выбранного периода." },
      { status: 422 }
    );
  }
  if (!chart?.western || !chart.birthFingerprint || !chart.engineVersion) {
    return NextResponse.json({ error: "Натальная карта неполна." }, { status: 409 });
  }

  const expectedEphemeris =
    typeof chart.western.ephemeris === "string" ? chart.western.ephemeris : "unknown";
  const reportType = `forecast:${horizon}`;
  const claimKey = reportType;
  const evidence = buildNatalEvidence(chart, { tradition: "western", timing });
  const evidenceBlock = formatEvidencePrompt(evidence);
  const timingEvidenceIds = evidence
    .filter((item) => item.tradition === "timing")
    .map((item) => item.id);
  if (!timingEvidenceIds.length) {
    return NextResponse.json(
      { error: "Для выбранного периода нет расчётных событий. Попробуйте другой горизонт или обновите карту." },
      { status: 422 }
    );
  }
  const claim = await claimNatalInterpretationResilient(
    auth.profileUserId,
    "western",
    chart.birthFingerprint,
    chart.engineVersion,
    expectedEphemeris,
    { reportType, claimKey }
  );
  if (claim.status === "cached") {
    return NextResponse.json({
      forecast: claim.interpretation,
      reportId: claim.reportId,
      report: claim.structuredData,
      evidence: claim.evidenceRefs,
      horizon,
      cached: true,
    });
  }
  if (claim.status === "busy") {
    return NextResponse.json(
      { error: "Не удалось начать прогноз. Обновите страницу и попробуйте снова.", code: "CLAIM_BUSY" },
      { status: 409 }
    );
  }
  if (claim.status === "unavailable") {
    return NextResponse.json({ error: "Карта изменилась. Обновите страницу." }, { status: 409 });
  }

  const systemPrompt = await wrapSystemPrompt(`Ты — Shri Raj, мастер астрологии Zovus. Создай персональный вероятностный прогноз на русском языке на период ${timing.windowStart} — ${timing.windowEnd}.
Опирайся ТОЛЬКО на evidence ниже. Не придумывай события, даты, положения или evidence ID. Конкретные даты называй только при наличии соответствующего evidence.
${buildNatalReportJsonInstructions("western", "forecast", horizon)}
Не используй фатальные формулировки. Отделяй рассчитанные астрологические факторы от символической интерпретации.
Координаты, дата, время и город рождения не переданы.

EVIDENCE:
${evidenceBlock}

TIMING EVIDENCE ID (обязательны в summary, currentPeriod, recommendations):
${timingEvidenceIds.join("\n")}`);

  let charge: Awaited<ReturnType<typeof BillingService.chargeRuneAction>> | undefined;
  let rollbackAttempted = false;
  const rollback = async () => {
    if (!charge || rollbackAttempted) return;
    rollbackAttempted = true;
    await BillingService.rollbackCharge({
      userId: auth.profileUserId,
      cost: charge.spentRunes,
      wasFreeQuestion: charge.wasFreeQuestion,
      transactionId: charge.transactionId,
      actionType: charge.actionType,
      slotReserved: charge.slotReserved,
    });
  };

  try {
    charge = await BillingService.chargeRuneAction({
      userId: auth.profileUserId,
      action: "FORECAST_REPORT",
    });
    const user = await getUserById(auth.profileUserId).catch(() => null);
    const baseMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Создай прогноз для ${user?.name ?? "клиента"} на ${horizon} дней. horizonDays в JSON должен быть ${horizon}. Верни только JSON.`,
      },
    ];
    const generated = await generateValidatedNatalReport({
      baseMessages,
      evidence,
      tradition: "western",
      reportType: "forecast",
      horizonDays: horizon,
      metadataDefaults: FORECAST_METADATA_DEFAULTS,
      evidenceIdsHint: timingEvidenceIds,
      repairHint:
        "В summary, currentPeriod и recommendations каждый claim должен ссылаться минимум на один timing evidence ID.",
    });
    if (!generated.ok) {
      console.warn(
        "[natal-chart] forecast validation failed:",
        generated.errors.slice(0, 12),
        `evidence=${evidence.length}`
      );
      await rollback();
      return NextResponse.json(
        { error: "Модель не смогла создать проверяемый прогноз. Оплата возвращена." },
        { status: 502 }
      );
    }

    const report = generated.report;
    const saved = await saveCurrentNatalInterpretation({
      userId: auth.profileUserId,
      tradition: "western",
      interpretation: natalReportToPlainText(report),
      expectedBirthFingerprint: chart.birthFingerprint,
      expectedEngineVersion: chart.engineVersion,
      expectedEphemeris,
      claimToken: claim.token,
      runeCost: charge.spentRunes,
      chargeTransactionId: charge.transactionId,
      structuredData: report as unknown as Record<string, unknown>,
      evidenceRefs: evidence,
      reportType,
      claimKey,
    });
    if (saved.status === "stale") {
      await rollback();
      return NextResponse.json(
        { error: "Карта изменилась. Оплата возвращена, попробуйте снова." },
        { status: 409 }
      );
    }
    if (saved.status === "already_saved") await rollback();
    return NextResponse.json({
      forecast: saved.report.content,
      reportId: saved.report.id,
      report: saved.report.structuredData,
      evidence: saved.report.evidenceRefs,
      horizon,
      cached: saved.status === "already_saved",
      runeBalance: saved.status === "saved" ? charge.newBalance : undefined,
    });
  } catch (error) {
    await rollback().catch(() => console.warn("[natal-chart] forecast rollback failed"));
    if (error instanceof InsufficientFundsError) {
      return NextResponse.json(
        { error: "insufficient", balance: error.balance, cost: error.required },
        { status: 402 }
      );
    }
    console.warn("[natal-chart] forecast generation failed");
    return NextResponse.json({ error: "Ошибка генерации прогноза." }, { status: 502 });
  } finally {
    await releaseNatalInterpretationClaim(
      auth.profileUserId,
      "western",
      claim.token,
      claimKey
    ).catch(() => console.warn("[natal-chart] forecast claim release failed"));
  }
}
