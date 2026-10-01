import { recoverSavedWorkerReport } from "@/lib/services/durable-report-receipt";
import { getReportWorkerJobFromRequest } from "@/lib/async-job-worker-auth";
import { natalBirthTimeError } from "@/lib/natal/time";
import { natalChartJobIdentity, natalQueuedChartMatches } from "@/lib/natal/job-identity";
import { getUserById } from "@/lib/users";
import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import {
  InsufficientFundsError,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import {
  buildNatalEvidence,
  formatEvidencePromptCompact,
  selectEvidenceForForecastPrompt,
} from "@/lib/natal/evidence";
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
import { appendNatalPersonalizationLens } from "@/lib/natal/personalization-lens";
import {
  profileAuthFailureResponse,
  resolveBirthProfileUserContext,
} from "@/lib/require-auth";
import { isAsyncJobWorkerConfigured } from "@/lib/async-job-worker-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { getAsyncJobWorkerUserId } from "@/lib/async-job-worker-auth";
import {
  beginWorkerJobSave,
  chargeRuneActionForWorkerJob,
  shouldRefundBeforeWorkerFail,
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
  refundWorkerJobCharge,
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
    const resolved = await resolveBirthProfileUserContext();
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
    forceRegenerate?: unknown;
    chartIdentity?: unknown;
  };
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  const recovered = await recoverSavedWorkerReport(auth.profileUserId, getReportWorkerJobFromRequest(request));
  if (recovered) return NextResponse.json(recovered);
  const forceRegenerate = body.forceRegenerate === true;
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
    if (!chart?.western || !chart.birthFingerprint) throw new Error("TIMING_CHART_INCOMPLETE");
    if (workerUserId && !natalQueuedChartMatches(body.chartIdentity, chart)) return NextResponse.json({ error: "Карта изменилась после заказа. Повторите заказ для текущей карты.", code: "chart_changed" }, { status: 409 });
  if (body.async === true && isAsyncJobWorkerConfigured()) {
    return enqueueNatalAsyncJob({
      userId: auth.profileUserId,
      kind: "natal_forecast",
      payload: {
        horizon,
        chartIdentity: natalChartJobIdentity(chart),
        aiDataUseAcknowledged: true,
        ...(forceRegenerate ? { forceRegenerate: true } : {}),
      },
    });
  }
    timing = await getOrComputePersonalTiming(auth.profileUserId, horizon, { chart })
      .then((result) => result.timing);
  } catch (error) {
    const timeError = natalBirthTimeError(error);
    if (timeError) return NextResponse.json({ error: timeError }, { status: 400 });
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
    { reportType, claimKey, forceRegenerate }
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
    await wrapSystemPrompt(`Ты — Shri Raj, мастер астрологии Zovus. Создай плотный персональный вероятностный прогноз на русском на период ${timing.windowStart} — ${timing.windowEnd}.
Опирайся ТОЛЬКО на evidence ниже. Не придумывай события, даты, положения или evidence ID. Конкретные даты называй только при наличии соответствующего evidence.
${chart.timeKnown ? "" : "Время рождения неизвестно: не заявляй дома, ASC, MC или лагну; явно отрази неопределённость там, где вывод зависит от точного времени."}
Пиши премиально и по-человечески: коротко, без воды и канцелярита. Каждый вывод — из расчёта, не из воздуха.
Это не расклад Таро. Сначала что человек заметит в жизни, потом одна короткая отсылка к фактору.
${buildNatalReportJsonInstructions("western", "forecast", horizon)}
Не используй фатальные формулировки.
Координаты, дата, время и город рождения не переданы.
${clientDisplayName ? `Имя клиента в тексте: «${clientDisplayName}» — только кириллица, без латиницы и смешанных написаний.` : ""}

EVIDENCE:
${evidenceBlock}

TIMING EVIDENCE ID (обязательны в summary, currentPeriod, recommendations):
${timingEvidenceIds.join("\n")}`),
    {
      profileUserId: auth.profileUserId,
      user: forecastUser,
      forecast: {
        horizonDays: horizon,
        windowStart: timing.windowStart,
        windowEnd: timing.windowEnd,
      },
    }
  );

  let charge: BillingChargeResult | undefined;
  let rollbackAttempted = false;
  let durablePayload: Record<string, unknown> | undefined;
  const rollback = async () => {
    if (!charge || rollbackAttempted) return;
    const outcome = await refundWorkerJobCharge(request, {
      userId: auth.profileUserId,
      cost: charge.spentRunes,
      wasFreeQuestion: charge.wasFreeQuestion,
      transactionId: charge.transactionId,
      actionType: charge.actionType,
      slotReserved: charge.slotReserved,
    });
    rollbackAttempted = outcome.refunded;
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
        "[natal-chart] forecast validation failed:",
        generated.errors.slice(0, 12),
        `evidence=${promptEvidence.length}/${evidence.length}`
      );
      // When report retry requeues this job the charge must survive — the next
      // attempt reuses it. Refund only when no requeue will happen.
      const refundNow = await shouldRefundBeforeWorkerFail(request, "invalid_model_report");
      if (refundNow) await rollback();
      await trackWorkerJobFailed(
        request,
        refundNow
          ? (rollbackAttempted ? "Не удалось получить AI-прогноз. Оплата возвращена." : "Не удалось получить AI-прогноз.")
          : "Не удалось получить AI-прогноз. Повторяем попытку.",
        { refunded: rollbackAttempted, errorCode: "invalid_model_report" }
      );
      return NextResponse.json(
        refundNow
          ? { error: (rollbackAttempted ? "Не удалось получить AI-прогноз. Оплата возвращена." : "Не удалось получить AI-прогноз."), refunded: rollbackAttempted }
          : { error: "Не удалось получить AI-прогноз. Повторяем попытку.", refunded: false },
        { status: 502 }
      );
    }

    const report = generated.report;
    if (!(await beginWorkerJobSave(request))) {
      await rollback();
      // The save barrier was lost (timeout/abort): refund landed, so close the
      // job terminally instead of leaving it running until the reaper.
      await trackWorkerJobFailed(
        request,
        (rollbackAttempted ? "Генерация была отменена по таймауту. Оплата возвращена." : "Генерация была отменена по таймауту."),
        { refunded: rollbackAttempted, errorCode: "generation_claim_lost" }
      );
      return NextResponse.json(
        {
          error: (rollbackAttempted ? "Генерация была отменена по таймауту. Оплата возвращена." : "Генерация была отменена по таймауту."),
          refunded: rollbackAttempted,
        },
        { status: 409 }
      );
    }
    const saved = await saveCurrentNatalInterpretation({
      forceRegenerate,
      userId: auth.profileUserId,
      tradition: "western",
      interpretation: natalReportToPlainText(report),
      expectedBirthFingerprint: chart.birthFingerprint,
      expectedEngineVersion: chart.engineVersion,
      expectedEphemeris,
      claimToken: claim.token,
      runeCost: charge.spentRunes,
      chargeTransactionId: charge.transactionId,
      workerJob: getReportWorkerJobFromRequest(request),
      structuredData: report as unknown as Record<string, unknown>,
      evidenceRefs: evidence,
      reportType,
      claimKey,
    });
    if (saved.status === "stale") {
      await rollback();
      await trackWorkerJobFailed(
        request,
        (rollbackAttempted ? "Карта изменилась. Оплата возвращена, попробуйте снова." : "Карта изменилась. попробуйте снова."),
        { refunded: rollbackAttempted, errorCode: "chart_stale" }
      );
      return NextResponse.json(
        { error: (rollbackAttempted ? "Карта изменилась. Оплата возвращена, попробуйте снова." : "Карта изменилась. попробуйте снова."), refunded: rollbackAttempted },
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
    durablePayload = payload;
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  } catch (error) {
    if (durablePayload) {
      // The receipt already exists. Return it; a later worker/reaper recovers delivery.
      console.warn("[natal-chart] completed receipt awaiting job delivery recovery");
      return NextResponse.json(durablePayload);
    }
    if (error instanceof InsufficientFundsError) {
      await trackWorkerJobFailed(request, "insufficient", { errorCode: "insufficient" });
      return NextResponse.json(
        { error: "insufficient", balance: error.balance, cost: error.required },
        { status: 402 }
      );
    }
    // Keep the charge when report retry will requeue this job (the next attempt
    // reuses it); refund only when the failure is terminal.
    const refundNow = await shouldRefundBeforeWorkerFail(request, "generation_failed");
    if (refundNow) {
      await rollback().catch(() => console.warn("[natal-chart] forecast rollback failed"));
    }
    const refunded = rollbackAttempted;
    console.warn("[natal-chart] forecast generation failed");
    await trackWorkerJobFailed(request, "Ошибка генерации прогноза.", {
      refunded,
      errorCode: "generation_failed",
    });
    return NextResponse.json(
      { error: "Ошибка генерации прогноза.", refunded },
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
