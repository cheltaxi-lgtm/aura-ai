import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { BillingService, InsufficientFundsError } from "@/lib/services/billing-service";
import { buildNatalEvidence, formatEvidencePrompt } from "@/lib/natal/evidence";
import {
  buildNatalReportJsonInstructions,
  extractJsonObject,
  natalReportToPlainText,
  validateNatalReport,
  withReportMetadataDefaults,
} from "@/lib/natal/report";
import { parseTimingHorizon } from "@/lib/natal/timing";
import {
  claimNatalInterpretation,
  getOrComputeNatalChart,
  releaseNatalInterpretationClaim,
  saveCurrentNatalInterpretation,
} from "@/lib/services/natal-chart-service";
import { getOrComputePersonalTiming } from "@/lib/services/natal-timing-service";
import { completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { getUserById } from "@/lib/users";

export const maxDuration = 300;

const FORECAST_METADATA_DEFAULTS = {
  disclaimer:
    "Астрологический прогноз является символической интерпретацией вероятных тем и не гарантирует событий, не заменяет медицинскую, юридическую или финансовую консультацию.",
  methodology:
    "Прогноз построен по рассчитанным транзитам, солнечному возвращению и вторичным прогрессиям выбранного периода. Каждый вывод связан с указанными timing evidence; натальные положения используются только как дополнительный контекст.",
};

function parseForecastCandidate(raw: string | null | undefined): unknown {
  return withReportMetadataDefaults(
    extractJsonObject(raw ?? ""),
    FORECAST_METADATA_DEFAULTS
  );
}

export async function POST(request: NextRequest) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const claim = await claimNatalInterpretation(
    auth.profileUserId,
    "western",
    chart.birthFingerprint,
    chart.engineVersion,
    expectedEphemeris,
    { reportType, claimKey }
  ).catch(() => null);
  if (!claim) {
    return NextResponse.json({ error: "Не удалось начать создание прогноза." }, { status: 500 });
  }
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
      { error: "Прогноз уже создаётся. Подождите немного и попробуйте снова." },
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
${evidenceBlock}`);

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
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Создай прогноз для ${user?.name ?? "клиента"}. Верни только JSON.` },
    ];
    let raw = await completeChat({
      messages,
      maxTokens: 5200,
      temperature: 0.3,
      timeoutMs: 170_000,
      maxAttempts: 1,
      jsonObject: true,
      allowReasoningFallback: true,
      skipTemperatureRetry: true,
    });
    let validation = (() => {
      try {
        return validateNatalReport(parseForecastCandidate(raw), evidence, "western", "forecast", horizon);
      } catch (error) {
        return { ok: false as const, errors: [error instanceof Error ? error.message : "Некорректный JSON."] };
      }
    })();
    if (!validation.ok) {
      const timingEvidenceIds = evidence
        .filter((item) => item.tradition === "timing")
        .map((item) => item.id);
      raw = await completeChat({
        messages: [
          ...messages,
          { role: "assistant", content: raw ?? "{}" },
          {
            role: "user",
            content: `Исправь JSON и верни его полностью, без сокращений и markdown. Не меняй порядок восьми разделов. Каждый claim прогноза должен содержать хотя бы один точный timing evidence ID из списка ниже.

Ошибки:
- ${validation.errors.join("\n- ")}

Допустимые timing evidence ID:
${timingEvidenceIds.join("\n")}`,
          },
        ],
        maxTokens: 5200,
        temperature: 0.15,
        timeoutMs: 90_000,
        maxAttempts: 1,
        jsonObject: true,
        allowReasoningFallback: true,
        skipTemperatureRetry: true,
      });
      try {
        validation = validateNatalReport(parseForecastCandidate(raw), evidence, "western", "forecast", horizon);
      } catch (error) {
        validation = { ok: false, errors: [error instanceof Error ? error.message : "Некорректный JSON."] };
      }
    }
    if (!validation.ok) {
      console.warn(
        "[natal-chart] forecast validation failed:",
        validation.errors.slice(0, 12)
      );
      await rollback();
      return NextResponse.json(
        { error: "Модель не смогла создать проверяемый прогноз. Оплата возвращена." },
        { status: 502 }
      );
    }

    const saved = await saveCurrentNatalInterpretation({
      userId: auth.profileUserId,
      tradition: "western",
      interpretation: natalReportToPlainText(validation.report),
      expectedBirthFingerprint: chart.birthFingerprint,
      expectedEngineVersion: chart.engineVersion,
      expectedEphemeris,
      claimToken: claim.token,
      runeCost: charge.spentRunes,
      chargeTransactionId: charge.transactionId,
      structuredData: validation.report as unknown as Record<string, unknown>,
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
