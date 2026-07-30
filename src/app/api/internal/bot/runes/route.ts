import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botRunesShopUrl, resolveBotUser } from "@/lib/telegram/bot-resolve";
import { starsFromPriceRub, type StarsRunePackage } from "@/lib/telegram/stars-runes";

export const runtime = "nodejs";

async function listStarsPackages(): Promise<StarsRunePackage[]> {
  const { rows } = await query<{
    id: string;
    name: string;
    runes: number;
    bonus_runes: number;
    price_rub: number;
    is_popular: boolean;
  }>(
    `SELECT id, name, runes, bonus_runes, price_rub, is_popular
     FROM rune_packages
     ORDER BY sort_order ASC`
  );
  return rows.map((r) => {
    const runes = Number(r.runes) || 0;
    const bonusRunes = Number(r.bonus_runes) || 0;
    const priceRub = Number(r.price_rub) || 0;
    return {
      id: r.id,
      name: r.name,
      runes,
      bonusRunes,
      totalRunes: runes + bonusRunes,
      priceRub,
      stars: starsFromPriceRub(priceRub),
      isPopular: Boolean(r.is_popular),
    };
  });
}

export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { telegram_user_id?: unknown };
  try {
    body = (await request.json()) as { telegram_user_id?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked) {
    return NextResponse.json(
      { ok: false, error: "needs_link", linkUrl: resolved.linkUrl },
      { status: 403 }
    );
  }

  const packages = await listStarsPackages();

  return NextResponse.json({
    ok: true,
    runeBalance: resolved.runeBalance ?? 0,
    shopUrl: botRunesShopUrl("runes"),
    cabinetUrl: resolved.linkUrl,
    packages,
    starsEnabled: true,
  });
}
