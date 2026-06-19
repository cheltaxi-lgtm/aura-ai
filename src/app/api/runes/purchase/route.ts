import { NextRequest, NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { createYukassaRunePayment, isYukassaConfigured } from "@/lib/yukassa";

export async function POST(request: NextRequest) {
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  if (!isYukassaConfigured()) {
    return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
  }

  let packageId: string;
  try {
    const body = await request.json();
    packageId = String(body.packageId ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!packageId) {
    return NextResponse.json({ error: "packageId required" }, { status: 400 });
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const payment = await createYukassaRunePayment({
      packageId: pkg.id,
      packageName: pkg.name,
      priceRub: pkg.price_rub,
      totalRunes,
      userId: authed.profileUserId,
      returnUrl: `${appUrl}/runes/success`,
    });

    const paymentUrl = payment.confirmation?.confirmation_url;
    if (!paymentUrl) {
      return NextResponse.json({ error: "No confirmation URL" }, { status: 502 });
    }

    return NextResponse.json({ paymentUrl, paymentId: payment.id });
  } catch (error) {
    console.error("Rune purchase error:", error);
    return NextResponse.json({ error: "Payment creation failed" }, { status: 502 });
  }
}
