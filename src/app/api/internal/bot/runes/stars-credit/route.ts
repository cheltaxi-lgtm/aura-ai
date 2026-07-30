import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { creditRunesFromPayment, getRuneBalance } from "@/lib/rune-service";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";
import {
  isStarsInvoiceFresh,
  parseStarsInvoicePayload,
  starsFromPriceRub,
  starsPaymentId,
} from "@/lib/telegram/stars-runes";

export const runtime = "nodejs";

/**
 * Credit runes after Telegram Stars successful_payment.
 * Idempotent on telegram_payment_charge_id (stored as tg_stars:…).
 */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    telegram_user_id?: unknown;
    package_id?: unknown;
    telegram_payment_charge_id?: unknown;
    total_amount?: unknown;
    invoice_payload?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  const packageId = typeof body.package_id === "string" ? body.package_id.trim() : "";
  const chargeId =
    typeof body.telegram_payment_charge_id === "string"
      ? body.telegram_payment_charge_id.trim()
      : "";
  const totalAmount =
    typeof body.total_amount === "number"
      ? body.total_amount
      : Number(body.total_amount);
  const invoicePayload =
    typeof body.invoice_payload === "string" ? body.invoice_payload.trim() : "";

  if (telegramUserId == null || !packageId || !chargeId) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const parsed = parseStarsInvoicePayload(invoicePayload);
  if (!parsed || parsed.telegramUserId !== telegramUserId || parsed.packageId !== packageId) {
    return NextResponse.json({ ok: false, error: "payload_mismatch" }, { status: 400 });
  }
  if (!isStarsInvoiceFresh(parsed.issuedAtSec)) {
    return NextResponse.json({ ok: false, error: "invoice_expired" }, { status: 400 });
  }

  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked || !resolved.profileUserId) {
    return NextResponse.json(
      { ok: false, error: "needs_link", linkUrl: resolved.linkUrl },
      { status: 403 }
    );
  }

  const { rows: pkgRows } = await query<{
    id: string;
    name: string;
    runes: number;
    bonus_runes: number;
    price_rub: number;
  }>(
    `SELECT id, name, runes, bonus_runes, price_rub FROM rune_packages WHERE id = $1`,
    [packageId]
  );
  const pkg = pkgRows[0];
  if (!pkg) {
    return NextResponse.json({ ok: false, error: "unknown_package" }, { status: 404 });
  }

  const expectedStars = starsFromPriceRub(pkg.price_rub);
  if (Number.isFinite(totalAmount) && Math.round(totalAmount) !== expectedStars) {
    console.warn(
      "[stars-credit] amount mismatch",
      chargeId,
      totalAmount,
      expectedStars,
      packageId
    );
    return NextResponse.json({ ok: false, error: "amount_mismatch" }, { status: 400 });
  }

  const paymentId = starsPaymentId(chargeId);
  // Omit amountRub — Stars are not RUB; package totals come from DB.
  const credited = await creditRunesFromPayment({
    userId: resolved.profileUserId,
    packageId: pkg.id,
    paymentId,
  });

  const runeBalance = await getRuneBalance(resolved.profileUserId);
  const totalRunes = pkg.runes + pkg.bonus_runes;

  return NextResponse.json({
    ok: true,
    credited,
    alreadyCredited: !credited,
    runeBalance,
    packageId: pkg.id,
    packageName: pkg.name,
    runesAdded: totalRunes,
    stars: expectedStars,
  });
}
