import { NextRequest, NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { isHumanDesignEnabled } from "@/lib/settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { completeChat, isOpenRouterConfigured, isRejectedLlmOutput, type ChatMessage } from "@/lib/llm";
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
  appendHdReportMessage,
  getHdChartById,
  getHdReportById,
  listHdReportMessages,
} from "@/lib/services/human-design-service";
import { buildHdAskSystemPrompt, formatHdEvidence } from "@/lib/human-design";
import { getUserById } from "@/lib/users";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";

export const maxDuration = 120;

const MAX_QUESTION_LENGTH = 2000;

export async function POST(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }
  const userId = resolved.profileUserId;

  const rateLimited = await enforcePaidRouteRateLimit(userId, "hd_ask");
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => ({}))) as {
    reportId?: unknown;
    question?: unknown;
  };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (typeof body.reportId !== "string" || !question) {
    return NextResponse.json({ error: "Укажите разбор и вопрос." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: "message_too_long" }, { status: 400 });
  }

  const report = await getHdReportById(body.reportId, userId);
  if (!report || report.status !== "done" || !report.reportText) {
    return NextResponse.json({ error: "Разбор не найден." }, { status: 404 });
  }
  const chart = await getHdChartById(report.chartId);
  if (!chart) {
    return NextResponse.json({ error: "Карта не найдена." }, { status: 404 });
  }

  if (!isOpenRouterConfigured()) {
    return NextResponse.json({ error: "Генерация временно недоступна." }, { status: 503 });
  }

  const user = await getUserById(userId).catch(() => null);
  const clientName = normalizePersonDisplayName(user?.name) || null;
  const evidence = formatHdEvidence(chart.chart);
  const systemPrompt = await wrapSystemPrompt(buildHdAskSystemPrompt(clientName));

  const history = await listHdReportMessages(report.id, 20);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `РАСЧЁТНЫЕ ДАННЫЕ:\n${evidence}\n\nТЕКСТ ТВОЕГО РАЗБОРА:\n${report.reportText}`,
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];

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
    charge = await chargeRuneAction({ userId, action: "HD_ASK", exempt });

    const answer = await completeChat({
      messages,
      maxTokens: 2000,
      temperature: 0.7,
      isPaid: true,
      timeoutMs: 90_000,
    });

    if (!answer || isRejectedLlmOutput(answer)) {
      await rollback();
      return NextResponse.json(
        { error: "Модель не смогла ответить. Оплата возвращена.", refunded: true },
        { status: 502 }
      );
    }

    await appendHdReportMessage(report.id, "user", question);
    await appendHdReportMessage(report.id, "assistant", answer.trim());

    return NextResponse.json({ answer: answer.trim(), runeBalance: charge.newBalance });
  } catch (error) {
    await rollback().catch(() => {
      console.warn("[human-design] ask rollback failed");
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
    console.warn("[human-design] ask failed");
    return NextResponse.json(
      { error: "Ошибка генерации ответа.", refunded: rollbackAttempted },
      { status: 502 }
    );
  }
}
