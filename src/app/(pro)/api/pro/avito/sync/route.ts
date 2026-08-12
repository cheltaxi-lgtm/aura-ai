import { NextRequest, NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import { isAvitoConfigured, isAvitoEnabled } from "@/lib/avito/config";
import {
  AvitoApiError,
  getSubscriptions,
  subscribeWebhook,
  unsubscribeWebhook,
} from "@/lib/avito/client";
import { getAvitoProAccess, syncAvitoChatsFromApi } from "@/modules/pro/avito/service";

export async function POST(request: NextRequest) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;

  if (!isAvitoEnabled() || !isAvitoConfigured()) {
    return NextResponse.json({ error: "avito_not_configured" }, { status: 503 });
  }

  const access = await getAvitoProAccess(prac.ctx.account.id);
  if (!access.allowed) {
    return NextResponse.json({ error: "avito_not_owner" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "sync";

  if (action === "sync") {
    try {
      const result = await syncAvitoChatsFromApi();
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof AvitoApiError) {
        return NextResponse.json(
          { error: "avito_api_error", status: err.status, detail: err.message },
          { status: 502 }
        );
      }
      throw err;
    }
  }

  if (action === "subscriptions") {
    const result = await getSubscriptions();
    return NextResponse.json({ ok: true, subscriptions: result.subscriptions ?? [] });
  }

  if (action === "subscribe" || action === "unsubscribe") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url.startsWith("https://")) {
      return NextResponse.json({ error: "url_required" }, { status: 400 });
    }
    if (action === "subscribe") {
      await subscribeWebhook(url);
    } else {
      await unsubscribeWebhook(url);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
