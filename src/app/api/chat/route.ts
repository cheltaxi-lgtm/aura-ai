import { NextRequest, NextResponse } from "next/server";

import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { enforceChatRateLimit } from "@/lib/api-guards";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";
import { getUserById } from "@/lib/users";
import { chargeChatBilling, type ChatBillingHandle } from "@/lib/services/billing-service";
import {
  ChatOrchestrator,
  parseChatRequest,
} from "@/lib/services/chat-orchestrator";

export async function POST(request: NextRequest) {
  let billingHandle: ChatBillingHandle | null = null;

  try {
    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Требуется регистрация", code: "auth_required" },
        { status: 401 }
      );
    }

    const rateLimited = await enforceChatRateLimit(auth.sub);
    if (rateLimited) return rateLimited;

    const profileUserId = await getProfileUserIdForAccount(auth.sub);
    const user = profileUserId ? await getUserById(profileUserId) : null;
    if (!user || !isUserAgeEligible(user)) {
      return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
    }

    const body = await request.json();
    const recaptchaToken =
      typeof body.recaptchaToken === "string" ? body.recaptchaToken : undefined;
    const captchaBlock = await enforceRecaptchaScope("chat", recaptchaToken, request);
    if (captchaBlock) return captchaBlock;

    const parsed = await parseChatRequest(body);
    if (!parsed.ok) return parsed.response;

    const prep = await ChatOrchestrator.prepare(auth.sub, parsed.parsed);
    if (!prep.ok) return prep.response;

    const billing = await chargeChatBilling(prep.billingParams);
    if (!billing.ok) return billing.response;

    billingHandle = billing.handle;
    // Parallel double-submit: charge collapsed — do not burn a second LLM turn.
    if (billing.handle.charge?.deduplicated) {
      return NextResponse.json({
        ok: true,
        reused: true,
        pending: true,
        sessionId: billing.session?.id ?? null,
        message: "Ответ уже формируется — дождитесь первого сообщения.",
      });
    }
    prep.orchestrator.applyBilling(billing.handle, billing.session);

    return await prep.orchestrator.run();
  } catch (error) {
    console.error("Chat API error:", error);
    const { reportError } = await import("@/lib/error-report");
    reportError(error, { route: "chat" });

    if (billingHandle) {
      await billingHandle.rollbackOnError();
    }

    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
