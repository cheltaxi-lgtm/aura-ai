import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";
import {
  isStarsInvoiceFresh,
  parseStarsInvoicePayload,
  starsFromPriceRub,
} from "@/lib/telegram/stars-runes";

export const runtime = "nodejs";

/** pre_checkout_query gate for Stars rune invoices. */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    telegram_user_id?: unknown;
    invoice_payload?: unknown;
    total_amount?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  const invoicePayload =
    typeof body.invoice_payload === "string" ? body.invoice_payload.trim() : "";
  const totalAmount =
    typeof body.total_amount === "number"
      ? body.total_amount
      : Number(body.total_amount);

  if (telegramUserId == null || !invoicePayload || !Number.isFinite(totalAmount)) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const parsed = parseStarsInvoicePayload(invoicePayload);
  if (!parsed || parsed.telegramUserId !== telegramUserId) {
    return NextResponse.json({ ok: false, error: "payload_mismatch", message: "Счёт устарел." });
  }
  if (!isStarsInvoiceFresh(parsed.issuedAtSec)) {
    return NextResponse.json({
      ok: false,
      error: "invoice_expired",
      message: "Счёт истёк — откройте «Руны» снова.",
    });
  }

  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked || !resolved.profileUserId) {
    return NextResponse.json({
      ok: false,
      error: "needs_link",
      message: "Сначала привяжите аккаунт Zovus.",
    });
  }

  const { rows } = await query<{ price_rub: number }>(
    `SELECT price_rub FROM rune_packages WHERE id = $1`,
    [parsed.packageId]
  );
  const pkg = rows[0];
  if (!pkg) {
    return NextResponse.json({ ok: false, error: "unknown_package", message: "Пакет не найден." });
  }

  const expected = starsFromPriceRub(pkg.price_rub);
  if (Math.round(totalAmount) !== expected) {
    return NextResponse.json({
      ok: false,
      error: "amount_mismatch",
      message: "Сумма не совпадает — откройте «Руны» снова.",
    });
  }

  return NextResponse.json({ ok: true, packageId: parsed.packageId, stars: expected });
}
