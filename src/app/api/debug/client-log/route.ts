import { NextRequest, NextResponse } from "next/server";

export async function POST(_request: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.DEBUG_CLIENT_LOG !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
