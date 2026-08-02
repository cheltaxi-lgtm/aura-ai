import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/brand";
import { query } from "@/lib/db";
import {
  MAX_CUSTOM_RUNE_PURCHASE_RUB,
  MIN_CUSTOM_RUNE_PURCHASE_RUB,
  runesFromRubAmount,
} from "@/lib/rune-purchase-constants";
import { buildRunePurchaseReturnUrl } from "@/lib/rune-purchase-client";
import { getRuneSettings } from "@/lib/rune-settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botRunesShopUrl, resolveBotUser } from "@/lib/telegram/bot-resolve";
import { createYukassaRunePayment, isYukassaConfigured } from "@/lib/yukassa";

export const runtime = "nodejs";

const CUSTOM_PACKAGE_ID = "custom";

function parseStrictCustomAmount(raw: unknown): number | null {
  const str = String(raw ?? "").trim();
  if (!/^\d+$/.test(str)) return null;
  const amountRub = parseInt(str, 10);
  if (!Number.isFinite(amountRub)) return null;
  return amountRub;
}

/**
 * Create a YooKassa payment for a rune package or custom amount (bot → site).
 */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    telegram_user_id?: unknown;
    package_id?: unknown;
    custom_amount?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId != null) {
    const limited = await enforcePaidRouteRateLimit(
      `tg:${telegramUserId}`,
      "rune_purchase"
    );
    if (limited) {
      return NextResponse.json({ ok: false, error: "rate_limit" }, { status: 429 });
    }
  }
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked || !resolved.profileUserId) {
    return NextResponse.json(
      { ok: false, error: "needs_link", linkUrl: resolved.linkUrl, shopUrl: botRunesShopUrl("runes") },
      { status: 403 }
    );
  }

  if (!isYukassaConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "payments_not_configured",
        message: "Оплата картой временно недоступна.",
        shopUrl: botRunesShopUrl("runes"),
      },
      { status: 503 }
    );
  }

  const appUrl = getAppUrl();
  const shopUrl = botRunesShopUrl("runes");
  const hasCustom =
    body.custom_amount !== undefined && body.custom_amount !== null && body.custom_amount !== "";

  let packageId: string;
  let packageName: string;
  let priceRub: number;
  let totalRunes: number;

  if (hasCustom) {
    const amountRub = parseStrictCustomAmount(body.custom_amount);
    if (amountRub === null) {
      return NextResponse.json(
        { ok: false, error: "invalid_amount", message: "Сумма — только цифры." },
        { status: 400 }
      );
    }
    if (amountRub > MAX_CUSTOM_RUNE_PURCHASE_RUB) {
      return NextResponse.json(
        {
          ok: false,
          error: "amount_too_high",
          message: `Максимум — ${MAX_CUSTOM_RUNE_PURCHASE_RUB} ₽.`,
        },
        { status: 400 }
      );
    }
    if (amountRub < MIN_CUSTOM_RUNE_PURCHASE_RUB) {
      return NextResponse.json(
        {
          ok: false,
          error: "amount_too_low",
          message: `Минимум — ${MIN_CUSTOM_RUNE_PURCHASE_RUB} ₽.`,
        },
        { status: 400 }
      );
    }
    const settings = await getRuneSettings();
    totalRunes = runesFromRubAmount(amountRub, settings.rubPerRune);
    if (totalRunes <= 0) {
      return NextResponse.json(
        { ok: false, error: "amount_too_low", message: "Сумма слишком мала для начисления рун." },
        { status: 400 }
      );
    }
    packageId = CUSTOM_PACKAGE_ID;
    packageName = "Своя сумма";
    priceRub = amountRub;
  } else {
    packageId =
      typeof body.package_id === "string" ? body.package_id.trim().slice(0, 64) : "";
    if (!packageId) {
      return NextResponse.json({ ok: false, error: "invalid_package_id" }, { status: 400 });
    }

    const { rows } = await query<{
      id: string;
      name: string;
      runes: number;
      price_rub: number;
      bonus_runes: number;
    }>("SELECT id, name, runes, price_rub, bonus_runes FROM rune_packages WHERE id = $1", [
      packageId,
    ]);

    const pkg = rows[0];
    if (!pkg) {
      return NextResponse.json({ ok: false, error: "package_not_found" }, { status: 404 });
    }

    priceRub = Number(pkg.price_rub) || 0;
    totalRunes = (Number(pkg.runes) || 0) + (Number(pkg.bonus_runes) || 0);
    if (priceRub < 1 || totalRunes < 1) {
      return NextResponse.json({ ok: false, error: "package_unavailable" }, { status: 400 });
    }
    packageName = pkg.name;
  }

  try {
    const payment = await createYukassaRunePayment({
      packageId,
      packageName,
      priceRub,
      totalRunes,
      userId: resolved.profileUserId,
      appUrl,
      returnUrl: `${appUrl.replace(/\/$/, "")}/runes/success`,
    });

    const paymentUrl = payment.confirmation?.confirmation_url;
    if (!paymentUrl) {
      return NextResponse.json(
        { ok: false, error: "no_confirmation_url", shopUrl },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentUrl,
      paymentId: payment.id,
      packageId,
      packageName,
      priceRub,
      totalRunes,
      runeBalance: resolved.runeBalance ?? 0,
      returnUrl: buildRunePurchaseReturnUrl(appUrl, payment.id),
      shopUrl,
    });
  } catch (err) {
    console.error("[bot/runes/purchase]", err);
    return NextResponse.json(
      {
        ok: false,
        error: "payment_create_failed",
        message: "Не удалось создать оплату. Попробуйте через кабинет.",
        shopUrl,
      },
      { status: 502 }
    );
  }
}
