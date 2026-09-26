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
import { randomUUID } from "node:crypto";
import { recordRuneCheckoutEvent } from "@/lib/rune-checkout-telemetry";

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

  const attemptKey = randomUUID();
  await recordRuneCheckoutEvent(authed.profileUserId, "payment_attempted", attemptKey);
  const rejected = async (error: string, status: number, code: string) => {
    await recordRuneCheckoutEvent(authed.profileUserId, "payment_failed", attemptKey, { errorCode: code });
    return NextResponse.json({ error, code }, { status });
  };

  if (!(await ensureDb())) {
    return rejected("Сервис временно недоступен. Попробуйте позже.", 503, "database_unavailable");
  }

  if (!isYukassaConfigured()) {
    await recordRuneCheckoutEvent(authed.profileUserId, "payment_failed", attemptKey, { errorCode: "payments_not_configured" });
    return NextResponse.json(
      {
        error:
          "Оплата временно недоступна: не настроены ключи ЮKassa на сервере. Обратитесь в поддержку.",
        code: "payments_not_configured",
      },
      { status: 503 }
    );
  }

  let body: { packageId?: string; customAmount?: number | string; recaptchaToken?: string; requestId?: string };
  try {
    body = await request.json();
  } catch {
    return rejected("Invalid JSON", 400, "invalid_json");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return rejected("Invalid body", 400, "invalid_body");

  const captchaBlock = await enforceRecaptchaScope("payments", body.recaptchaToken, request);
  if (captchaBlock) {
    await recordRuneCheckoutEvent(authed.profileUserId, "payment_failed", attemptKey, { errorCode: "captcha_rejected" });
    return captchaBlock;
  }
  if(body.requestId !== undefined && (typeof body.requestId!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId))) return rejected("invalid_request_id",400,"invalid_request_id");

  const appUrl = getAppUrl();
  const customAmountRaw = body.customAmount;
  const hasCustomAmount =
    customAmountRaw !== undefined && customAmountRaw !== null && customAmountRaw !== "";

  if (hasCustomAmount) {
    const amountRub = parseStrictCustomAmount(customAmountRaw);
    if (amountRub === null) {
      return rejected("Invalid amount",400,"invalid_amount");
    }

    if (amountRub > MAX_CUSTOM_RUNE_PURCHASE_RUB) {
      return rejected("Amount exceeds limit",400,"amount_exceeds_limit");
    }

    if (amountRub < MIN_CUSTOM_RUNE_PURCHASE_RUB) {
      return rejected(`Минимальная сумма — ${MIN_CUSTOM_RUNE_PURCHASE_RUB} ₽`,400,"amount_below_minimum");
    }

    const settings = await getRuneSettings();
    const totalRunes = runesFromRubAmount(amountRub, settings.rubPerRune);
    if (totalRunes <= 0) {
      return rejected("Сумма слишком мала для начисления рун",400,"insufficient_amount");
    }

    try {
      const payment = await createYukassaRunePayment({
        requestId: body.requestId,
        packageId: CUSTOM_PACKAGE_ID,
        packageName: "Произвольная сумма",
        priceRub: amountRub,
        totalRunes,
        userId: authed.profileUserId,
        appUrl,
      });

      const paymentUrl = payment.confirmation?.confirmation_url;
      if (!paymentUrl) {
        return rejected("No confirmation URL",502,"missing_confirmation_url");
      }
      await recordRuneCheckoutEvent(authed.profileUserId,"payment_started",payment.id,{amountRub,runes:totalRunes});

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
      return rejected("Payment creation failed",502,"provider_creation_failed");
    }
  }

  const packageId = String(body.packageId ?? "");
  if (!packageId) {
    return rejected("packageId or customAmount required",400,"selection_required");
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
    return rejected("Пакет не найден",404,"package_not_found");
  }

  const totalRunes = pkg.runes + pkg.bonus_runes;

  try {
    const payment = await createYukassaRunePayment({
      requestId: body.requestId,
      packageId: pkg.id,
      packageName: pkg.name,
      priceRub: pkg.price_rub,
      totalRunes,
      userId: authed.profileUserId,
      appUrl,
    });

    const paymentUrl = payment.confirmation?.confirmation_url;
    if (!paymentUrl) {
      return rejected("No confirmation URL",502,"missing_confirmation_url");
    }
    await recordRuneCheckoutEvent(authed.profileUserId,"payment_started",payment.id,{amountRub:Number(pkg.price_rub),runes:totalRunes});

    return NextResponse.json({
      paymentUrl,
      paymentId: payment.id,
      returnUrl: buildRunePurchaseReturnUrl(appUrl, payment.id),
    });
  } catch (error) {
    console.error("Rune purchase error:", error);
    const { reportError } = await import("@/lib/error-report");
    reportError(error, { route: "runes/purchase", kind: "package" });
    return rejected("Payment creation failed",502,"provider_creation_failed");
  }
}
