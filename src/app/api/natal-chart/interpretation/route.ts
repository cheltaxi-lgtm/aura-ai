import { NextRequest, NextResponse } from "next/server";
import { needsProfileResponse, requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { buildNatalEvidence, formatEvidencePrompt } from "@/lib/natal/evidence";
import {
  buildNatalReportJsonInstructions,
  natalReportToPlainText,
} from "@/lib/natal/report";
import { generateValidatedNatalReport } from "@/lib/natal/generate-validated-report";
import {
  claimNatalInterpretationResilient,
  getOrComputeNatalChart,
  releaseNatalInterpretationClaim,
  saveCurrentNatalInterpretation,
} from "@/lib/services/natal-chart-service";
import { BillingService, InsufficientFundsError } from "@/lib/services/billing-service";
import { getUserById } from "@/lib/users";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import type { NatalTradition } from "@/lib/natal/types";
import { getCachedPersonalTiming } from "@/lib/services/natal-timing-service";
import type { ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";

export const maxDuration = 300;

function isInvalidBirthDateError(error: unknown): boolean {
  return error instanceof Error && error.message === "INVALID_BIRTH_DATE";
}

const INTERPRETATION_METADATA_DEFAULTS = {
  disclaimer:
    "Астрологическая трактовка является символической интерпретацией и не заменяет профессиональную консультацию.",
  methodology:
    "Отчёт построен по рассчитанным натальным положениям и аспектам. Каждый вывод связан с указанными evidence.",
};

export async function POST(request: NextRequest) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const ctx = await requireProfileUserId();
  if (!ctx) {
    return needsProfileResponse();
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
  const evidenceIds = evidence.map((item) => item.id);
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

  const claim = await claimNatalInterpretationResilient(
    ctx.profileUserId,
    tradition,
    expectedBirthFingerprint,
    expectedEngineVersion,
    expectedEphemeris
  );
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
      { error: "Не удалось начать трактовку. Обновите страницу и попробуйте снова.", code: "CLAIM_BUSY" },
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
${evidenceBlock}

VALID EVIDENCE ID:
${evidenceIds.join("\n")}`);

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
    const generated = await generateValidatedNatalReport({
      baseMessages,
      evidence,
      tradition,
      reportType: "interpretation",
      metadataDefaults: INTERPRETATION_METADATA_DEFAULTS,
      evidenceIdsHint: evidenceIds,
      repairHint: "Используй только ID из списка VALID EVIDENCE ID.",
    });
    if (!generated.ok) {
      console.warn(
        "[natal-chart] interpretation validation failed:",
        generated.errors.slice(0, 12),
        `evidence=${evidence.length}`
      );
      await rollback();
      return NextResponse.json(
        { error: "Модель не смогла создать проверяемый отчёт. Оплата возвращена." },
        { status: 502 }
      );
    }
    const report = generated.report;
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
