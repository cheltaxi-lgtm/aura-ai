import { NextRequest, NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import { isAvitoConfigured, isAvitoEnabled } from "@/lib/avito/config";
import { AvitoApiError } from "@/lib/avito/client";
import { getAvitoProAccess, sendProAvitoMessage } from "@/modules/pro/avito/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;

  if (!isAvitoEnabled() || !isAvitoConfigured()) {
    return NextResponse.json({ error: "avito_not_configured" }, { status: 503 });
  }

  const access = await getAvitoProAccess(prac.ctx.account.id);
  if (!access.allowed) {
    return NextResponse.json({ error: "avito_not_owner" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content : "";

  try {
    const message = await sendProAvitoMessage({
      chatId: id,
      content,
      accountId: prac.ctx.account.id,
    });
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    if (err instanceof Error && err.message === "message_required") {
      return NextResponse.json({ error: "message_required" }, { status: 400 });
    }
    if (err instanceof Error && err.message === "chat_not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof AvitoApiError) {
      // 402 = paid messenger subscription missing on the Avito account.
      return NextResponse.json(
        { error: "avito_api_error", status: err.status, detail: err.message },
        { status: 502 }
      );
    }
    throw err;
  }
}
