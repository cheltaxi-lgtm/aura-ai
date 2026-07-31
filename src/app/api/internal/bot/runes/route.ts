import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  MAX_CUSTOM_RUNE_PURCHASE_RUB,
  MIN_CUSTOM_RUNE_PURCHASE_RUB,
} from "@/lib/rune-purchase-constants";
import { getRuneSettings } from "@/lib/rune-settings";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botRunesShopUrl, resolveBotUser } from "@/lib/telegram/bot-resolve";

export const runtime = "nodejs";

type BotRunePackage = {
  id: string;
  name: string;
  runes: number;
  bonusRunes: number;
  totalRunes: number;
  priceRub: number;
  /** @deprecated Stars checkout removed — kept 0 for older bot builds. */
  stars: number;
  isPopular: boolean;
};

async function listRunePackages(): Promise<BotRunePackage[]> {
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
      stars: 0,
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

  const packages = await listRunePackages();
  const settings = await getRuneSettings();

  return NextResponse.json({
    ok: true,
    runeBalance: resolved.runeBalance ?? 0,
    shopUrl: botRunesShopUrl("runes"),
    cabinetUrl: resolved.linkUrl,
    packages,
    starsEnabled: false,
    customAmount: {
      enabled: true,
      minRub: MIN_CUSTOM_RUNE_PURCHASE_RUB,
      maxRub: MAX_CUSTOM_RUNE_PURCHASE_RUB,
      rubPerRune: settings.rubPerRune,
    },
  });
}
