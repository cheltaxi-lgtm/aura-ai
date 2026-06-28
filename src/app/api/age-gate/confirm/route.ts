import { NextResponse } from "next/server";

import { setAgeGateCookie } from "@/lib/age-gate-cookie";

export async function POST() {
  try {
    await setAgeGateCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Age gate confirm error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
