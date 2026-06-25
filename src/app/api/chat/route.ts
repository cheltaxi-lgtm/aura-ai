import { NextRequest, NextResponse } from "next/server";

import { requireUserAuth } from "@/lib/require-auth";
import { enforceChatRateLimit } from "@/lib/api-guards";
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

    const body = await request.json();
    const parsed = await parseChatRequest(body);
    if (!parsed.ok) return parsed.response;

    const prep = await ChatOrchestrator.prepare(auth.sub, parsed.parsed);
    if (!prep.ok) return prep.response;

    const billing = await chargeChatBilling(prep.billingParams);
    if (!billing.ok) return billing.response;

    billingHandle = billing.handle;
    prep.orchestrator.applyBilling(billing.handle, billing.session);

    return await prep.orchestrator.run();
  } catch (error) {
    console.error("Chat API error:", error);

    if (billingHandle) {
      await billingHandle.rollbackOnError();
    }

    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
