import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import {
  getBotCatalogItem,
  getBotCatalogPage,
  getBotCatalogSummary,
} from "@/lib/telegram/bot-catalog-service";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";

export const runtime = "nodejs";

/**
 * Full site spread-intent catalog for the Telegram bot (thin client).
 * Same source as /rasklady — no duplicated seed lists in the bot package.
 */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    telegram_user_id?: unknown;
    action?: unknown;
    category?: unknown;
    q?: unknown;
    page?: unknown;
    page_size?: unknown;
    slug?: unknown;
    featured?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  const resolved = await resolveBotUser(telegramUserId);
  const userGender = resolved.gender;
  const action = typeof body.action === "string" ? body.action.trim() : "summary";

  if (action === "item") {
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!slug) {
      return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });
    }
    const item = getBotCatalogItem(slug, userGender);
    if (!item) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      linked: resolved.linked,
      linkUrl: resolved.linkUrl,
      runeBalance: resolved.runeBalance,
      gender: userGender,
      item,
    });
  }

  if (action === "list") {
    const page = getBotCatalogPage({
      category: typeof body.category === "string" ? body.category : null,
      q: typeof body.q === "string" ? body.q : null,
      page: typeof body.page === "number" ? body.page : Number(body.page) || 0,
      pageSize:
        typeof body.page_size === "number" ? body.page_size : Number(body.page_size) || 8,
      featured: body.featured === true || body.featured === "true" || body.featured === 1,
      userGender,
    });
    return NextResponse.json({
      ok: true,
      linked: resolved.linked,
      linkUrl: resolved.linkUrl,
      runeBalance: resolved.runeBalance,
      gender: userGender,
      ...page,
    });
  }

  // summary (default)
  const summary = getBotCatalogSummary(userGender);
  return NextResponse.json({
    ok: true,
    linked: resolved.linked,
    linkUrl: resolved.linkUrl,
    runeBalance: resolved.runeBalance,
    ...summary,
  });
}
