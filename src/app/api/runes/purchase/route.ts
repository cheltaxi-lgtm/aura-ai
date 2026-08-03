import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/brand";
import { buildRunePurchaseReturnUrl } from "@/lib/rune-purchase-client";
import { ensureDb, query } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { createYukassaRunePayment, isYukassaConfigured } from "@/lib/yukassa";
import { getRuneSettings } from "@/lib/rune-settings";
import {
  MAX_CUSTOM_RUNE_PURCHASE_RUB,
  MIN_CUSTOM_RUNE_PURCHASE_RUB,
  runesFromRubAmount,
} from "@/lib/rune-purchase-constants";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";

const CUSTOM_PACKAGE_ID = "custom";

function parseStrictCustomAmount(raw: unknown): number | null {
  const str = String(raw ?? "").trim();
  if (!/^\d+$/.test(str)) return null;
  const amountRub = parseInt(str, 10);
  if (!Number.isFinite(amountRub)) return null;
  return amountRub;
}

export async function POST(request: NextRequest) {
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(authed.auth.sub, "rune_purchase");
  if (rateLimited) return rateLimited;

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  if (!isYukassaConfigured()) {
    return NextResponse.json(
      {
        error:
          "Оплата временно недоступна: не настроены ключи ЮKassa на сервере. Обратитесь в поддержку.",
        code: "payments_not_configured",
      },
      { status: 503 }
    );
  }

  let body: { packageId?: string; customAmount?: number | string; recaptchaToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const captchaBlock = await enforceRecaptchaScope("payments", body.recaptchaToken, request);
  if (captchaBlock) return captchaBlock;

  const appUrl = getAppUrl();
  const customAmountRaw = body.customAmount;
  const hasCustomAmount =
    customAmountRaw !== undefined && customAmountRaw !== null && customAmountRaw !== "";

  if (hasCustomAmount) {
    const amountRub = parseStrictCustomAmount(customAmountRaw);
    if (amountRub === null) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (amountRub > MAX_CUSTOM_RUNE_PURCHASE_RUB) {
      return NextResponse.json({ error: "Amount exceeds limit" }, { status: 400 });
    }

    if (amountRub < MIN_CUSTOM_RUNE_PURCHASE_RUB) {
      return NextResponse.json(
        { error: `Минимальная сумма — ${MIN_CUSTOM_RUNE_PURCHASE_RUB} ₽` },
        { status: 400 }
      );
    }

    const settings = await getRuneSettings();
    const totalRunes = runesFromRubAmount(amountRub, settings.rubPerRune);
    if (totalRunes <= 0) {
      return NextResponse.json({ error: "Сумма слишком мала для начисления рун" }, { status: 400 });
    }

    try {
      const payment = await createYukassaRunePayment({
        packageId: CUSTOM_PACKAGE_ID,
        packageName: "Произвольная сумма",
        priceRub: amountRub,
        totalRunes,
        userId: authed.profileUserId,
        appUrl,
      });

      const paymentUrl = payment.confirmation?.confirmation_url;
      if (!paymentUrl) {
        return NextResponse.json({ error: "No confirmation URL" }, { status: 502 });
      }

      return NextResponse.json({
        paymentUrl,
        paymentId: payment.id,
        runes: totalRunes,
        returnUrl: buildRunePurchaseReturnUrl(appUrl, payment.id),
      });
    } catch (error) {
      console.error("Rune custom purchase error:", error);
      const { reportError } = await import("@/lib/error-report");
      reportError(error, { route: "runes/purchase", kind: "custom" });
      return NextResponse.json({ error: "Payment creation failed" }, { status: 502 });
    }
  }

  const packageId = String(body.packageId ?? "");
  if (!packageId) {
    return NextResponse.json({ error: "packageId or customAmount required" }, { status: 400 });
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
    return NextResponse.json({ error: "Пакет не найден" }, { status: 404 });
  }

  const totalRunes = pkg.runes + pkg.bonus_runes;

  try {
    const payment = await createYukassaRunePayment({
      packageId: pkg.id,
      packageName: pkg.name,
      priceRub: pkg.price_rub,
      totalRunes,
      userId: authed.profileUserId,
      appUrl,
    });

    const paymentUrl = payment.confirmation?.confirmation_url;
    if (!paymentUrl) {
      return NextResponse.json({ error: "No confirmation URL" }, { status: 502 });
    }

    return NextResponse.json({
      paymentUrl,
      paymentId: payment.id,
      returnUrl: buildRunePurchaseReturnUrl(appUrl, payment.id),
    });
  } catch (error) {
    console.error("Rune purchase error:", error);
    const { reportError } = await import("@/lib/error-report");
    reportError(error, { route: "runes/purchase", kind: "package" });
    return NextResponse.json({ error: "Payment creation failed" }, { status: 502 });
  }
}
