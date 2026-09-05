import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Legacy bearer receipts are retired. Current Telegram flows use an
 * authenticated site session and never transfer a copied URL token.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "retired",
      code: "retired",
      message: "Перенос старого гостевого расклада закрыт. Сделайте новый расклад в Zovus.",
    },
    { status: 410 },
  );
}
