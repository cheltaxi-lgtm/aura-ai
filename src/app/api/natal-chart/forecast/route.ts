import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import {
  BillingService,
  InsufficientFundsError,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import {
  buildNatalEvidence,
  formatEvidencePromptCompact,
  selectEvidenceForForecastPrompt,
} from "@/lib/natal/evidence";
import {
  buildMinimalNatalReport,
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
import { appendNatalPersonalizationLens } from "@/lib/natal/personalization-lens";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { isAsyncJobWorkerConfigured } from "@/lib/async-job-worker-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { getUserById } from "@/lib/users";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { getAsyncJobWorkerUserId } from "@/lib/async-job-worker-auth";
import {
  beginWorkerJobSave,
  chargeRuneActionForWorkerJob,
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
  trackWorkerJobRefunded,
} from "@/lib/natal/async-job-lifecycle";
import { enqueueNatalAsyncJob } from "@/lib/natal/async-job-route";

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
  const workerUserId = getAsyncJobWorkerUserId(request);
  let auth: { profileUserId: string };
  if (workerUserId) {
    auth = { profileUserId: workerUserId };
  } else {
    const resolved = await resolveProfileUserContext();
    if (!resolved.ok) return profileAuthFailureResponse(resolved.reason);
    auth = { profileUserId: resolved.profileUserId };
  }
  if (!workerUserId) {
    const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "natal_forecast");
    if (limited) return limited;
  }

  const body = await request.json().catch(() => ({})) as {
    horizon?: unknown;
    aiDataUseAcknowledged?: unknown;
    async?: unknown;
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
  if (body.async === true && isAsyncJobWorkerConfigured()) {
    return enqueueNatalAsyncJob({
      userId: auth.profileUserId,
      kind: "natal_forecast",
      payload: {
        horizon: body.horizon,
        aiDataUseAcknowledged: true,
      },
    });
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
  // A forecast is only valid for its calculated timing window. Including the
  // start date prevents a past 30-day forecast from being returned forever as
  // a current result for the same natal chart.
  const reportType = `forecast:${horizon}:${timing.windowStart}`;
  const claimKey = reportType;
  const evidence = buildNatalEvidence(chart, { tradition: "western", timing });
  // Cap prompt evidence so long-horizon forecasts fit LLM context/output reliably.
  const promptEvidence = selectEvidenceForForecastPrompt(evidence, horizon);
  const evidenceBlock = formatEvidencePromptCompact(promptEvidence);
  const timingEvidenceIds = promptEvidence
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
    const payload = {
      forecast: claim.interpretation,
      reportId: claim.reportId,
      report: claim.structuredData,
      evidence: claim.evidenceRefs,
      horizon,
      cached: true,
    };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  }
  if (claim.status === "busy") {
    await trackWorkerJobFailed(
      request,
      "Не удалось начать прогноз. Обновите страницу и попробуйте снова.",
      { errorCode: "CLAIM_BUSY" }
    );
    return NextResponse.json(
      { error: "Не удалось начать прогноз. Обновите страницу и попробуйте снова.", code: "CLAIM_BUSY" },
      { status: 409 }
    );
  }
  if (claim.status === "unavailable") {
    await trackWorkerJobFailed(request, "Карта изменилась. Обновите страницу.", {
      errorCode: "chart_changed",
    });
    return NextResponse.json({ error: "Карта изменилась. Обновите страницу." }, { status: 409 });
  }

  const forecastUser = await getUserById(auth.profileUserId).catch(() => null);
  const clientDisplayName = normalizePersonDisplayName(forecastUser?.name) || null;
  const systemPrompt = await appendNatalPersonalizationLens(
    await wrapSystemPrompt(`Ты — Shri Raj, мастер астрологии Zovus. Создай персональный вероятностный прогноз на русском языке на период ${timing.windowStart} — ${timing.windowEnd}.
Опирайся ТОЛЬКО на evidence ниже. Не придумывай события, даты, положения или evidence ID. Конкретные даты называй только при наличии соответствующего evidence.
${buildNatalReportJsonInstructions("western", "forecast", horizon)}
Не используй фатальные формулировки. Отделяй рассчитанные астрологические факторы от символической интерпретации.
Координаты, дата, время и город рождения не переданы.
${clientDisplayName ? `Имя клиента в тексте: «${clientDisplayName}» — только кириллица, без латиницы и смешанных написаний.` : ""}

EVIDENCE:
${evidenceBlock}

TIMING EVIDENCE ID (обязательны в summary, currentPeriod, recommendations):
${timingEvidenceIds.join("\n")}`),
    { profileUserId: auth.profileUserId, user: forecastUser }
  );

  let charge: BillingChargeResult | undefined;
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
    await trackWorkerJobRefunded(request);
  };

  try {
    charge = await chargeRuneActionForWorkerJob({
      request,
      userId: auth.profileUserId,
      action: "FORECAST_REPORT",
    });
    const baseMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Создай прогноз для ${clientDisplayName ?? "клиента"} на ${horizon} дней. horizonDays в JSON должен быть ${horizon}. Верни только JSON.`,
      },
    ];
    let generated = await generateValidatedNatalReport({
      baseMessages,
      evidence: promptEvidence,
      tradition: "western",
      reportType: "forecast",
      horizonDays: horizon,
      metadataDefaults: FORECAST_METADATA_DEFAULTS,
      evidenceIdsHint: timingEvidenceIds,
      repairHint:
        "В summary, currentPeriod и recommendations каждый claim должен ссылаться минимум на один timing evidence ID.",
      clientName: clientDisplayName ?? undefined,
    });
    if (!generated.ok) {
      console.warn(
        "[natal-chart] forecast validation failed, using evidence fallback:",
        generated.errors.slice(0, 12),
        `evidence=${promptEvidence.length}/${evidence.length}`
      );
      const fallback = buildMinimalNatalReport(
        evidence,
        "western",
        "forecast",
        horizon,
        FORECAST_METADATA_DEFAULTS
      );
      if (!fallback.ok) {
        await rollback();
        await trackWorkerJobFailed(
          request,
          "Не удалось подготовить прогноз по расчётным данным. Оплата возвращена.",
          { refunded: true, errorCode: "invalid_model_report" }
        );
        return NextResponse.json(
          {
            error: "Не удалось подготовить прогноз по расчётным данным. Оплата возвращена.",
            refunded: true,
          },
          { status: 502 }
        );
      }
      generated = { ok: true, report: fallback.report, raw: null };
    }

    const report = generated.report;
    if (!(await beginWorkerJobSave(request))) {
      await rollback();
      return NextResponse.json(
        {
          error: "Генерация была отменена по таймауту. Оплата возвращена.",
          refunded: true,
        },
        { status: 409 }
      );
    }
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
      await trackWorkerJobFailed(
        request,
        "Карта изменилась. Оплата возвращена, попробуйте снова.",
        { refunded: true, errorCode: "chart_stale" }
      );
      return NextResponse.json(
        { error: "Карта изменилась. Оплата возвращена, попробуйте снова.", refunded: true },
        { status: 409 }
      );
    }
    if (saved.status === "already_saved") await rollback();
    const payload = {
      forecast: saved.report.content,
      reportId: saved.report.id,
      report: saved.report.structuredData,
      evidence: saved.report.evidenceRefs,
      horizon,
      cached: saved.status === "already_saved",
      runeBalance: saved.status === "saved" ? charge.newBalance : undefined,
      refunded: saved.status === "already_saved",
    };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  } catch (error) {
    await rollback().catch(() => console.warn("[natal-chart] forecast rollback failed"));
    if (error instanceof InsufficientFundsError) {
      await trackWorkerJobFailed(request, "insufficient", { errorCode: "insufficient" });
      return NextResponse.json(
        { error: "insufficient", balance: error.balance, cost: error.required },
        { status: 402 }
      );
    }
    console.warn("[natal-chart] forecast generation failed");
    await trackWorkerJobFailed(request, "Ошибка генерации прогноза.", {
      refunded: rollbackAttempted,
      errorCode: "generation_failed",
    });
    return NextResponse.json(
      { error: "Ошибка генерации прогноза.", refunded: rollbackAttempted },
      { status: 502 }
    );
  } finally {
    await releaseNatalInterpretationClaim(
      auth.profileUserId,
      "western",
      claim.token,
      claimKey
    ).catch(() => console.warn("[natal-chart] forecast claim release failed"));
  }
}
