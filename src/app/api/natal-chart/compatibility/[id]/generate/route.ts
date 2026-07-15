import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isCompatibilityId } from "@/lib/natal/compatibility-api";
import {
  buildCompatibilityEvidence,
  compatibilityReportJsonInstructions,
  extractCompatibilityJson,
  formatCompatibilityEvidence,
  validateCompatibilityReport,
} from "@/lib/natal/compatibility-report";
import { completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { requireProfileUserId } from "@/lib/require-auth";
import { isNatalChartEnabled } from "@/lib/settings";
import { BillingService, InsufficientFundsError } from "@/lib/services/billing-service";
import {
  claimCompatibilityGeneration,
  releaseCompatibilityClaim,
  saveCompatibilityReport,
} from "@/lib/services/natal-compatibility-service";

export const maxDuration = 300;
type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "natal_compatibility_generate"
  );
  if (limited) return limited;
  const { id } = await params;
  if (!isCompatibilityId(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.aiDataUseAcknowledged !== true) {
    return NextResponse.json(
      { error: "ai_data_use_acknowledgement_required" },
      { status: 400 }
    );
  }

  const claim = await claimCompatibilityGeneration(id, auth.profileUserId);
  if (claim.status === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (claim.status === "cached") {
    return NextResponse.json({ record: claim.record, cached: true });
  }
  if (claim.status === "not_ready") {
    return NextResponse.json({ error: "charts_not_ready" }, { status: 409 });
  }
  if (claim.status === "busy") {
    return NextResponse.json({ error: "generation_in_progress" }, { status: 409 });
  }
  if (!claim.record.synastry) {
    await releaseCompatibilityClaim(id, auth.profileUserId, claim.token);
    return NextResponse.json({ error: "synastry_missing" }, { status: 409 });
  }

  const evidence = buildCompatibilityEvidence(claim.record.synastry);
  const systemPrompt = await wrapSystemPrompt(`Ты — астрологический аналитик Zovus.
Создай проверяемый отчёт о совместимости на русском языке.
Используй ТОЛЬКО рассчитанный evidence ниже. Не выдумывай положения, аспекты,
биографические факты или даты. Не делай предсказаний и не упоминай координаты.
${compatibilityReportJsonInstructions()}

EVIDENCE:
${formatCompatibilityEvidence(evidence)}`);
  const baseMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: "Составь структурированный отчёт по предоставленному evidence. Верни только JSON.",
    },
  ];

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
      action: "SYNASTRY_REPORT",
    });
    let raw = await completeChat({
      messages: baseMessages,
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
        return validateCompatibilityReport(extractCompatibilityJson(raw ?? ""), evidence);
      } catch (error) {
        return {
          ok: false as const,
          errors: [error instanceof Error ? error.message : "invalid_json"],
        };
      }
    })();
    if (!validation.ok) {
      raw = await completeChat({
        messages: [
          ...baseMessages,
          { role: "assistant", content: raw ?? "{}" },
          {
            role: "user",
            content: `Исправь JSON и верни весь объект. Ошибки:\n- ${validation.errors.join("\n- ")}`,
          },
        ],
        maxTokens: 5200,
        temperature: 0.1,
        timeoutMs: 90_000,
        maxAttempts: 1,
        jsonObject: true,
        allowReasoningFallback: true,
        skipTemperatureRetry: true,
      });
      try {
        validation = validateCompatibilityReport(
          extractCompatibilityJson(raw ?? ""),
          evidence
        );
      } catch (error) {
        validation = {
          ok: false,
          errors: [error instanceof Error ? error.message : "invalid_json"],
        };
      }
    }
    if (!validation.ok) {
      await rollback();
      return NextResponse.json(
        { error: "invalid_model_report", refunded: true },
        { status: 502 }
      );
    }

    const saved = await saveCompatibilityReport({
      id,
      ownerUserId: auth.profileUserId,
      claimToken: claim.token,
      report: validation.report,
      evidence,
      runeCost: charge.spentRunes,
      chargeTransactionId: charge.transactionId,
    });
    if (!saved) {
      await rollback();
      return NextResponse.json(
        { error: "generation_claim_lost", refunded: true },
        { status: 409 }
      );
    }
    return NextResponse.json({ record: saved, runeBalance: charge.newBalance });
  } catch (error) {
    await rollback().catch(() => {
      console.warn("[natal-compatibility] billing rollback failed");
    });
    if (error instanceof InsufficientFundsError) {
      return NextResponse.json(
        { error: "insufficient", balance: error.balance, cost: error.required },
        { status: 402 }
      );
    }
    console.warn("[natal-compatibility] generation failed");
    return NextResponse.json({ error: "generation_failed" }, { status: 502 });
  } finally {
    await releaseCompatibilityClaim(id, auth.profileUserId, claim.token).catch(() => {
      console.warn("[natal-compatibility] claim release failed");
    });
  }
}
