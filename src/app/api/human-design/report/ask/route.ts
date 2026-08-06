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
import { withTransaction } from "@/lib/db";
import {
  chargeRuneAction,
  ensureSufficientRunes,
  InsufficientFundsError,
} from "@/lib/services/billing-service";
import {
  appendHdReportMessage,
  consumeHdReportIncludedAsk,
  getHdChartById,
  getHdReportById,
  HD_UUID_RE,
  listHdReportMessages,
} from "@/lib/services/human-design-service";
import {
  buildHdAskSystemPrompt,
  formatHdEvidence,
  sanitizeHdReportText,
} from "@/lib/human-design";
import { getUserById } from "@/lib/users";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";

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

  const profileRow = await getUserById(userId).catch(() => null);
  if (!profileRow || !isUserAgeEligible(profileRow)) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    reportId?: unknown;
    question?: unknown;
    aiDataUseAcknowledged?: unknown;
  };
  if (body.aiDataUseAcknowledged !== true) {
    return NextResponse.json(
      { error: "Подтвердите передачу рассчитанных данных карты внешней языковой модели." },
      { status: 400 }
    );
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (typeof body.reportId !== "string" || !HD_UUID_RE.test(body.reportId) || !question) {
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

  const clientName = normalizePersonDisplayName(profileRow.name) || null;
  const evidence = formatHdEvidence(chart.chart);
  const systemPrompt = await wrapSystemPrompt(buildHdAskSystemPrompt(clientName));

  // Cap prompt history: every ask re-sends evidence + full report text, so
  // each extra message pair is pure token cost on a per-question price.
  const history = await listHdReportMessages(report.id, 10);
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

  try {
    // Generate-first: a crash during the LLM call can never lose the user's
    // runes. Balance is pre-checked so broke users don't burn model tokens;
    // the authoritative charge commits atomically with the stored messages.
    // Max-package included asks skip the balance gate (consumed after generation).
    const hasIncludedAsk = !exempt && report.includedAsksRemaining > 0;
    if (!hasIncludedAsk) {
      await ensureSufficientRunes({ userId, action: "HD_ASK", exempt });
    }

    const answer = await completeChat({
      messages,
      maxTokens: 2000,
      temperature: 0.7,
      isPaid: true,
      timeoutMs: 90_000,
    });

    if (!answer || isRejectedLlmOutput(answer)) {
      return NextResponse.json(
        { error: "Модель не смогла ответить. Оплата не списывалась." },
        { status: 502 }
      );
    }

    // Same output hygiene as the report itself: no emojis, no meta-leaks.
    // Runs BEFORE the charge — an unsalvageable answer must not be billed.
    const text = sanitizeHdReportText(answer.trim());
    if (!text) {
      return NextResponse.json(
        { error: "Модель не смогла ответить. Оплата не списывалась." },
        { status: 502 }
      );
    }
    const result = await withTransaction(async (client) => {
      let includedAsksRemaining: number | null = null;
      let runeBalance: number | undefined;
      if (!exempt) {
        includedAsksRemaining = await consumeHdReportIncludedAsk(report.id, client);
      }
      if (includedAsksRemaining === null) {
        const c = await chargeRuneAction({ userId, action: "HD_ASK", exempt, client });
        runeBalance = c.newBalance;
      }
      await appendHdReportMessage(report.id, "user", question, client);
      await appendHdReportMessage(report.id, "assistant", text, client);
      return { runeBalance, includedAsksRemaining };
    });

    return NextResponse.json({
      answer: text,
      runeBalance: result.runeBalance,
      includedAsksRemaining: result.includedAsksRemaining,
      usedIncludedAsk: result.includedAsksRemaining !== null,
    });
  } catch (error) {
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
      { error: "Ошибка генерации ответа. Оплата не списывалась." },
      { status: 502 }
    );
  }
}

/**
 * Owner-scoped message history. A paid answer commits atomically with the
 * charge — if the HTTP response is lost, the client refetches it here
 * instead of paying again for a retry.
 */
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

  const reportId = request.nextUrl.searchParams.get("reportId") ?? "";
  if (!HD_UUID_RE.test(reportId)) {
    return NextResponse.json({ error: "Укажите разбор." }, { status: 400 });
  }

  const report = await getHdReportById(reportId, resolved.profileUserId);
  if (!report) {
    return NextResponse.json({ error: "Разбор не найден." }, { status: 404 });
  }

  const messages = await listHdReportMessages(report.id, 40);
  return NextResponse.json({ messages });
}
