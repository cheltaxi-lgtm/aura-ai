import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { getCabinetRitualStats } from "@/lib/ritual-service";

export async function GET() {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats = await getCabinetRitualStats(authed.profileUserId);
  return NextResponse.json({ stats });
}
