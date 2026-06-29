import { NextRequest, NextResponse } from "next/server";

import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { ensureDb } from "@/lib/db";
import { insufficientRunesResponse } from "@/lib/insufficient-runes";
import { requireUserAuth } from "@/lib/require-auth";
import {
  chargeChatBilling,
  InsufficientFundsError,
  SessionQuestionLimitError,
  type ChatBillingHandle,
} from "@/lib/services/billing-service";
import { runNumerologTool } from "@/lib/services/numerology-tool-runner";
import { getRuneSettings } from "@/lib/rune-settings";
import { ensureChatSession } from "@/lib/session-access";
import { getUserById } from "@/lib/users";
import {
  buildNumerologToolMessage,
  isNumerologToolId,
  validateNumerologToolParams,
  type NumerologToolParams,
} from "@/lib/numerology/tools";

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "numerolog_tool");
  if (rateLimited) return rateLimited;

  let billingHandle: ChatBillingHandle | null = null;

  try {
    const body = (await request.json()) as {
      toolId?: string;
      params?: NumerologToolParams;
      sessionId?: string;
      spreadNumbers?: string[];
    };

    const toolId = body.toolId ?? "";
    if (!isNumerologToolId(toolId) || toolId === "spread_three_numbers") {
      return NextResponse.json({ error: "invalid_tool" }, { status: 400 });
    }

    const validationError = validateNumerologToolParams(toolId, body.params);
    if (validationError) {
      return NextResponse.json({ error: "invalid_params", message: validationError }, { status: 422 });
    }

    const profileUserId = await getProfileUserIdForAccount(auth.sub);
    if (!profileUserId) {
      return NextResponse.json({ error: "profile_required" }, { status: 400 });
    }

    const profileRow = await getUserById(profileUserId);
    if (!profileRow || !isUserAgeEligible(profileRow)) {
      return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
    }

    const dbOk = await ensureDb();
    const ensured = await ensureChatSession(body.sessionId, profileUserId);
    if (ensured.error) return ensured.error;
    const session = ensured.session;
    if (!session) {
      return NextResponse.json({ error: "session_required" }, { status: 400 });
    }

    const unlimited = await resolveUnlimitedAccess({ accountId: auth.sub, profileUserId });
    const runeSettings = await getRuneSettings();
    const billing = await chargeChatBilling({
      dbOk,
      profileUserId,
      session,
      unlimited,
      runeSettings,
      freeLimit: runeSettings.freeQuestions,
      imageBase64: undefined,
    });
    if (!billing.ok) return billing.response;

    billingHandle = billing.handle;

    const result = await runNumerologTool({
      profileUserId,
      sessionId: session.id,
      toolId,
      params: body.params,
      spreadNumbers: Array.isArray(body.spreadNumbers)
        ? body.spreadNumbers.filter((n): n is string => typeof n === "string")
        : undefined,
    });

    return NextResponse.json({
      ...result,
      sessionId: session.id,
      runeBalance: billing.handle.runeBalance,
      freeQuestionsRemaining: billing.handle.freeQuestionsRemaining,
      userMessage: buildNumerologToolMessage(toolId, body.params),
    });
  } catch (err) {
    if (billingHandle) {
      await billingHandle.rollbackOnError();
    }

    if (err instanceof InsufficientFundsError) {
      return insufficientRunesResponse(err.balance, err.required);
    }
    if (err instanceof SessionQuestionLimitError) {
      return NextResponse.json(
        { error: "session_question_limit", message: err.message },
        { status: 403 }
      );
    }

    console.error("Numerolog tool API error:", err);
    return NextResponse.json({ error: "tool_failed" }, { status: 500 });
  }
}
