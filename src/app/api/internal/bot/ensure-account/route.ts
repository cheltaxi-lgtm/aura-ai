import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { ensureBotOfferAccount } from "@/lib/telegram/bot-offer-account";

export const runtime = "nodejs";

/**
 * Bot → site: ensure Zovus account after bot age/offer consent.
 * Creates shell account + telegram bind; does not use Telegram Login Widget.
 */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    telegram_user_id?: unknown;
    first_name?: unknown;
    username?: unknown;
    photo_url?: unknown;
    terms_accepted_at?: unknown;
    age_confirmed_at?: unknown;
    marketing_consent?: unknown;
    attribution?: unknown;
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

  const termsAcceptedAt =
    typeof body.terms_accepted_at === "string" ? body.terms_accepted_at.trim() : "";
  const ageConfirmedAt =
    typeof body.age_confirmed_at === "string" ? body.age_confirmed_at.trim() : "";
  if (!termsAcceptedAt || !ageConfirmedAt) {
    return NextResponse.json({ ok: false, error: "consent_required" }, { status: 400 });
  }

  let attribution: Record<string, string> | null = null;
  if (body.attribution && typeof body.attribution === "object" && !Array.isArray(body.attribution)) {
    attribution = {};
    for (const [k, v] of Object.entries(body.attribution as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim() && k.length < 64) {
        attribution[k] = v.trim().slice(0, 200);
      }
    }
  }

  try {
    const result = await ensureBotOfferAccount({
      telegramUserId,
      firstName: typeof body.first_name === "string" ? body.first_name : null,
      username: typeof body.username === "string" ? body.username : null,
      photoUrl: typeof body.photo_url === "string" ? body.photo_url : null,
      termsAcceptedAt,
      ageConfirmedAt,
      marketingConsent: Boolean(body.marketing_consent),
      attribution,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ensure_failed";
    console.error("[bot/ensure-account]", err);
    if (msg === "CONSENT_TIMESTAMPS_REQUIRED") {
      return NextResponse.json({ ok: false, error: "consent_required" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "ensure_failed" }, { status: 500 });
  }
}
