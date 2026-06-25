import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getRitualStats } from "@/lib/ritual-service";

export async function GET(request: NextRequest) {
  await ensureDb();

  const type = request.nextUrl.searchParams.get("type")?.trim() ?? "";
  const characterKey = request.nextUrl.searchParams.get("characterKey")?.trim() ?? "";

  if (!type || !characterKey) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const stats = await getRitualStats(type, characterKey);
  return NextResponse.json({
    total: stats.total,
    signsReported: stats.signsReported,
    percentage: stats.percentage,
  });
}
