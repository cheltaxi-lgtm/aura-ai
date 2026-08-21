import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { isCompatibilityId } from "@/lib/natal/compatibility-api";
import {
  buildCompatibilityEvidence,
  compatibilityReportJsonInstructions,
  extractCompatibilityJson,
  formatCompatibilityEvidence,
  salvageCompatibilityReport,
  validateCompatibilityReport,
} from "@/lib/natal/compatibility-report";
import { getNatalModel } from "@/lib/ai-model";
import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { appendNatalPersonalizationLens } from "@/lib/natal/personalization-lens";
import { requireProfileUserId } from "@/lib/require-auth";
import { getUserById } from "@/lib/users";
import { isNatalChartEnabled } from "@/lib/settings";
import {
  BillingService,
  InsufficientFundsError,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import {
  compatibilityChartsAreCurrent,
  claimCompatibilityGeneration,
  releaseCompatibilityClaim,
  saveCompatibilityReport,
} from "@/lib/services/natal-compatibility-service";
import { getAsyncJobWorkerUserId } from "@/lib/async-job-worker-auth";
import {
  beginWorkerJobSave,
  chargeRuneActionForWorkerJob,
  shouldRefundBeforeWorkerFail,
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
  trackWorkerJobRefunded,
} from "@/lib/natal/async-job-lifecycle";
import { enqueueNatalAsyncJob } from "@/lib/natal/async-job-route";

export const maxDuration = 300;
type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const workerUserId = getAsyncJobWorkerUserId(request);
  const auth = workerUserId
    ? { profileUserId: workerUserId }
    : await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!workerUserId) {
    const limited = await enforcePaidRouteRateLimit(
      auth.profileUserId,
      "natal_compatibility_generate"
    );
    if (limited) return limited;
  }
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
  if (body.async === true) {
    return enqueueNatalAsyncJob({
      userId: auth.profileUserId,
      kind: "natal_compatibility",
      payload: { id, aiDataUseAcknowledged: true },
    });
  }
  if (!(await compatibilityChartsAreCurrent(id, auth.profileUserId))) {
    return NextResponse.json(
      {
        error: "Карты изменились после создания совместимости. Обновите расчёт — это бесплатно.",
        code: "charts_changed",
      },
      { status: 409 }
    );
  }

  const claim = await claimCompatibilityGeneration(id, auth.profileUserId);
  if (claim.status === "not_found") {
    await trackWorkerJobFailed(request, "not_found", { errorCode: "not_found" });
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (claim.status === "cached") {
    const payload = { record: claim.record, cached: true };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  }
  if (claim.status === "not_ready") {
    await trackWorkerJobFailed(request, "charts_not_ready", { errorCode: "charts_not_ready" });
    return NextResponse.json({ error: "charts_not_ready" }, { status: 409 });
  }
  if (claim.status === "busy") {
    await trackWorkerJobFailed(request, "generation_in_progress", {
      errorCode: "generation_in_progress",
    });
    return NextResponse.json({ error: "generation_in_progress" }, { status: 409 });
  }
  if (!claim.record.synastry) {
    await releaseCompatibilityClaim(id, auth.profileUserId, claim.token);
    await trackWorkerJobFailed(request, "synastry_missing", { errorCode: "synastry_missing" });
    return NextResponse.json({ error: "synastry_missing" }, { status: 409 });
  }

  const evidence = buildCompatibilityEvidence(claim.record.synastry);
  // Snapshots persist per-chart timeKnown; absent flag means legacy known-time.
  const eitherTimeUnknown =
    claim.record.synastry?.chartA?.timeKnown === false ||
    claim.record.synastry?.chartB?.timeKnown === false;
  const compatUser = await getUserById(auth.profileUserId).catch(() => null);
  const systemPrompt = await appendNatalPersonalizationLens(
    await wrapSystemPrompt(`Ты — астрологический аналитик Zovus.
Создай проверяемый отчёт о совместимости на русском языке.
Это не расклад Таро: сначала как это ощущается в паре, потом одна короткая отсылка к аспекту.
Используй ТОЛЬКО рассчитанный evidence ниже. Не выдумывай положения, аспекты,
биографические факты или даты. Не делай предсказаний и не упоминай координаты.
${eitherTimeUnknown ? "У одного из партнёров время рождения неизвестно: не заявляй дома, ASC, MC или лагну и не делай выводов из асцендента; явно отрази неопределённость там, где вывод зависит от точного времени." : ""}
${compatibilityReportJsonInstructions()}

EVIDENCE:
${formatCompatibilityEvidence(evidence)}`),
    { profileUserId: auth.profileUserId, user: compatUser }
  );
  const baseMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: "Составь структурированный отчёт по предоставленному evidence. Верни только JSON.",
    },
  ];

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
      action: "SYNASTRY_REPORT",
    });
    const natalModel = await getNatalModel();
    const first = await completeChatDetailed({
      messages: baseMessages,
      maxTokens: 7000,
      temperature: 0.3,
      timeoutMs: 170_000,
      maxAttempts: 3,
      jsonObject: true,
      allowReasoningFallback: true,
      skipTemperatureRetry: true,
      modelOverride: natalModel,
      priority: "report",
    });
    let raw = first.text;
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
      const repaired = await completeChatDetailed({
        messages: [
          ...baseMessages,
          { role: "assistant", content: raw ?? "{}" },
          {
            role: "user",
            content: `Исправь JSON и верни весь объект целиком. Ошибки:\n- ${validation.errors.slice(0, 12).join("\n- ")}\nИспользуй только evidence ID из списка аспектов и dimension:<key>.`,
          },
        ],
        maxTokens: 7000,
        temperature: 0.1,
        timeoutMs: 90_000,
        maxAttempts: 3,
        jsonObject: true,
        allowReasoningFallback: true,
        skipTemperatureRetry: true,
        modelOverride: natalModel,
        priority: "report",
      });
      raw = repaired.text;
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
    // Keep model prose where possible; coerce evidence IDs / fill thin sections from synastry.
    if (!validation.ok) {
      try {
        const salvaged = salvageCompatibilityReport(
          extractCompatibilityJson(raw ?? "{}"),
          evidence
        );
        if (salvaged.ok) {
          console.warn("[natal-compatibility] accepted via evidence salvage");
          validation = salvaged;
        }
      } catch {
        /* keep prior validation errors */
      }
    }
    if (!validation.ok) {
      // Absolute fallback: pure evidence-grounded report (no LLM prose).
      const grounded = salvageCompatibilityReport({}, evidence);
      if (grounded.ok) {
        console.warn("[natal-compatibility] accepted via grounded synastry salvage");
        validation = grounded;
      }
    }
    if (!validation.ok) {
      console.warn(
        "[natal-compatibility] validation failed:",
        validation.errors.slice(0, 12).join("; ")
      );
      // When report retry requeues this job the charge must survive — the next
      // attempt reuses it. Refund only when no requeue will happen.
      const refundNow = await shouldRefundBeforeWorkerFail(request, "invalid_model_report");
      if (refundNow) await rollback();
      await trackWorkerJobFailed(
        request,
        refundNow
          ? "Модель не смогла создать проверяемый отчёт. Оплата возвращена."
          : "Модель не смогла создать проверяемый отчёт. Повторяем попытку.",
        {
          refunded: refundNow,
          errorCode: "invalid_model_report",
        }
      );
      return NextResponse.json(
        {
          error: "invalid_model_report",
          refunded: refundNow,
          message: refundNow
            ? "Модель не смогла создать проверяемый отчёт. Оплата возвращена."
            : "Модель не смогла создать проверяемый отчёт. Повторяем попытку.",
        },
        { status: 502 }
      );
    }

    if (!(await beginWorkerJobSave(request))) {
      await rollback();
      // The save barrier was lost (timeout/abort): refund landed, so close the
      // job terminally instead of leaving it running until the reaper.
      await trackWorkerJobFailed(request, "generation_timeout", {
        refunded: true,
        errorCode: "generation_claim_lost",
      });
      return NextResponse.json(
        { error: "generation_timeout", refunded: true },
        { status: 409 }
      );
    }
    const saved = await saveCompatibilityReport({
      id,
      ownerUserId: auth.profileUserId,
      claimToken: claim.token,
      report: { ...validation.report, model: natalModel },
      evidence,
      runeCost: charge.spentRunes,
      chargeTransactionId: charge.transactionId,
    });
    if (!saved) {
      await rollback();
      await trackWorkerJobFailed(request, "generation_claim_lost", {
        refunded: true,
        errorCode: "generation_claim_lost",
      });
      return NextResponse.json(
        { error: "generation_claim_lost", refunded: true },
        { status: 409 }
      );
    }
    const payload = { record: saved, runeBalance: charge.newBalance };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  } catch (error) {
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
      await rollback().catch(() => {
        console.warn("[natal-compatibility] billing rollback failed");
      });
    }
    const refunded = refundNow && rollbackAttempted;
    console.warn("[natal-compatibility] generation failed");
    await trackWorkerJobFailed(request, "generation_failed", {
      refunded,
      errorCode: "generation_failed",
    });
    return NextResponse.json(
      { error: "generation_failed", refunded },
      { status: 502 }
    );
  } finally {
    await releaseCompatibilityClaim(id, auth.profileUserId, claim.token).catch(() => {
      console.warn("[natal-compatibility] claim release failed");
    });
  }
}
