import { NextRequest, NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { buildNatalEvidence, formatEvidencePrompt } from "@/lib/natal/evidence";
import {
  buildNatalReportJsonInstructions,
  extractJsonObject,
  natalReportToPlainText,
  validateNatalReport,
} from "@/lib/natal/report";
import {
  claimNatalInterpretation,
  getOrComputeNatalChart,
  releaseNatalInterpretationClaim,
  saveCurrentNatalInterpretation,
} from "@/lib/services/natal-chart-service";
import { BillingService, InsufficientFundsError } from "@/lib/services/billing-service";
import { getUserById } from "@/lib/users";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import type { NatalTradition } from "@/lib/natal/types";
import { getCachedPersonalTiming } from "@/lib/services/natal-timing-service";
import { completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";

export const maxDuration = 300;

function isInvalidBirthDateError(error: unknown): boolean {
  return error instanceof Error && error.message === "INVALID_BIRTH_DATE";
}

export async function POST(request: NextRequest) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const ctx = await requireProfileUserId();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(
    ctx.profileUserId,
    "natal_chart_interpretation"
  );
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => ({}))) as {
    tradition?: unknown;
    aiDataUseAcknowledged?: unknown;
  };
  if (body.aiDataUseAcknowledged !== true) {
    return NextResponse.json(
      { error: "Подтвердите передачу рассчитанных натальных evidence внешней языковой модели." },
      { status: 400 }
    );
  }
  const tradition: NatalTradition =
    body.tradition === "vedic" ? "vedic" : body.tradition === "western" ? "western" : "western";

  let chart;
  try {
    chart = await getOrComputeNatalChart(ctx.profileUserId);
  } catch (error) {
    if (isInvalidBirthDateError(error)) {
      return NextResponse.json(
        { error: "Проверьте дату рождения в профиле." },
        { status: 400 }
      );
    }
    console.warn("[natal-chart] calculation failed");
    return NextResponse.json(
      { error: "Не удалось рассчитать натальную карту." },
      { status: 500 }
    );
  }
  if (!chart?.[tradition]) {
    return NextResponse.json(
      { error: `Расчёт «${tradition === "western" ? "Западная" : "Ведическая"}» недоступен.` },
      { status: 400 }
    );
  }

  const expectedBirthFingerprint = chart.birthFingerprint;
  const expectedEngineVersion = chart.engineVersion;
  const expectedEphemeris =
    chart.western && typeof chart.western.ephemeris === "string"
      ? chart.western.ephemeris
      : "unknown";
  let timing = null;
  try {
    timing = await getCachedPersonalTiming(ctx.profileUserId);
  } catch {
    // A report remains grounded in natal evidence when no short timing cache exists.
  }
  const evidence = buildNatalEvidence(chart, { tradition, timing });
  const evidenceBlock = formatEvidencePrompt(evidence);
  if (!expectedBirthFingerprint || !expectedEngineVersion || !evidenceBlock.trim()) {
    return NextResponse.json(
      { error: "Данные натальной карты неполны. Пересчитайте карту и попробуйте снова." },
      { status: 409 }
    );
  }

  let user;
  try {
    user = await getUserById(ctx.profileUserId);
  } catch {
    return NextResponse.json({ error: "Не удалось подготовить трактовку." }, { status: 500 });
  }

  const claim = await claimNatalInterpretation(
    ctx.profileUserId,
    tradition,
    expectedBirthFingerprint,
    expectedEngineVersion,
    expectedEphemeris
  ).catch(() => null);
  if (!claim) {
    return NextResponse.json({ error: "Не удалось начать трактовку." }, { status: 500 });
  }
  if (claim.status === "cached") {
    return NextResponse.json({
      interpretation: claim.interpretation,
      report: claim.structuredData,
      evidence: claim.evidenceRefs,
      tradition,
      cached: true,
    });
  }
  if (claim.status === "busy") {
    return NextResponse.json(
      { error: "Трактовка уже создаётся. Подождите немного и попробуйте снова." },
      { status: 409 }
    );
  }
  if (claim.status === "unavailable") {
    return NextResponse.json(
      { error: "Натальная карта изменилась. Обновите страницу и попробуйте снова." },
      { status: 409 }
    );
  }

  const traditionLabel = tradition === "western" ? "западную тропическую" : "ведическую сидерическую";
  const systemPrompt = await wrapSystemPrompt(`Ты — Shri Raj, мастер астрологии Zovus. Составь доказуемую ${traditionLabel} натальную трактовку на русском языке.
Опирайся ТОЛЬКО на evidence ниже. Нельзя выдумывать положения, дома, даты или evidence ID.
${buildNatalReportJsonInstructions(tradition)}
${chart.timeKnown ? "" : "Время рождения неизвестно: не заявляй дома, ASC, MC или лагну; явно отрази неопределённость."}
Координаты рождения не переданы и не нужны.

EVIDENCE:
${evidenceBlock}`);

  let charge: Awaited<ReturnType<typeof BillingService.chargeRuneAction>> | undefined;
  let rollbackAttempted = false;
  const rollback = async () => {
    if (!charge || rollbackAttempted) return;
    rollbackAttempted = true;
    await BillingService.rollbackCharge({
      userId: ctx.profileUserId,
      cost: charge.spentRunes,
      wasFreeQuestion: charge.wasFreeQuestion,
      transactionId: charge.transactionId,
      actionType: charge.actionType,
      slotReserved: charge.slotReserved,
    });
  };

  try {
    charge = await BillingService.chargeRuneAction({
      userId: ctx.profileUserId,
      action: "NATAL_READING",
    });

    const baseMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Создай отчёт для ${user?.name ?? "клиента"}. Верни только JSON.` },
    ];
    let raw = await completeChat({
      messages: baseMessages,
      maxTokens: 5200,
      temperature: 0.35,
      timeoutMs: 170_000,
      maxAttempts: 1,
      jsonObject: true,
      allowReasoningFallback: true,
      skipTemperatureRetry: true,
    });
    let validation = (() => {
      try {
        return validateNatalReport(extractJsonObject(raw ?? ""), evidence, tradition);
      } catch (error) {
        return { ok: false as const, errors: [error instanceof Error ? error.message : "Некорректный JSON."] };
      }
    })();
    if (!validation.ok) {
      const repairMessages: ChatMessage[] = [
        ...baseMessages,
        { role: "assistant", content: raw ?? "{}" },
        {
          role: "user",
          content: `Исправь JSON и верни полный объект заново. Ошибки валидации:\n- ${validation.errors.join("\n- ")}`,
        },
      ];
      raw = await completeChat({
        messages: repairMessages,
        maxTokens: 5200,
        temperature: 0.15,
        timeoutMs: 90_000,
        maxAttempts: 1,
        jsonObject: true,
        allowReasoningFallback: true,
        skipTemperatureRetry: true,
      });
      try {
        validation = validateNatalReport(extractJsonObject(raw ?? ""), evidence, tradition);
      } catch (error) {
        validation = { ok: false, errors: [error instanceof Error ? error.message : "Некорректный JSON."] };
      }
    }
    if (!validation.ok) {
      await rollback();
      return NextResponse.json(
        { error: "Модель не смогла создать проверяемый отчёт. Оплата возвращена." },
        { status: 502 }
      );
    }
    const report = validation.report;
    const interpretation = natalReportToPlainText(report);

    const saved = await saveCurrentNatalInterpretation({
      userId: ctx.profileUserId,
      tradition,
      interpretation,
      expectedBirthFingerprint,
      expectedEngineVersion,
      expectedEphemeris,
      claimToken: claim.token,
      runeCost: charge.spentRunes,
      chargeTransactionId: charge.transactionId,
      structuredData: report as unknown as Record<string, unknown>,
      evidenceRefs: evidence,
    });
    if (saved.status === "stale") {
      await rollback();
      return NextResponse.json(
        { error: "Натальная карта изменилась. Оплата возвращена, попробуйте снова." },
        { status: 409 }
      );
    }
    if (saved.status === "already_saved") {
      await rollback();
      return NextResponse.json({
        interpretation: saved.report.content,
        report: saved.report.structuredData,
        evidence: saved.report.evidenceRefs,
        tradition,
        cached: true,
      });
    }

    return NextResponse.json({
      interpretation: saved.report.content,
      report: saved.report.structuredData,
      evidence: saved.report.evidenceRefs,
      tradition,
      runeBalance: charge.newBalance,
    });
  } catch (error) {
    await rollback().catch(() => {
      console.warn("[natal-chart] billing rollback failed");
    });
    if (error instanceof InsufficientFundsError) {
      return NextResponse.json(
        { error: "insufficient", balance: error.balance, cost: error.required },
        { status: 402 }
      );
    }
    console.warn("[natal-chart] interpretation failed");
    return NextResponse.json({ error: "Ошибка генерации трактовки." }, { status: 502 });
  } finally {
    await releaseNatalInterpretationClaim(
      ctx.profileUserId,
      tradition,
      claim.token
    ).catch(() => {
      console.warn("[natal-chart] claim release failed");
    });
  }
}
