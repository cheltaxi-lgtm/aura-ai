import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";

/** Compatibility response for clients that still request the retired single-card product. */
export async function POST() {
  if (!(await requireUserAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    {
      error: "daily_card_replaced",
      message: "Откройте расклад на сутки.",
      href: "/?daily=1",
    },
    { status: 410 }
  );
}
