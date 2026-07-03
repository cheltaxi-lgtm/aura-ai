import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [features] = await Promise.all([
      getSetting("features"),
      query("SELECT 1"),
    ]);
    return NextResponse.json({
      ok: true,
      maintenanceMode: features.maintenanceMode === true,
    });
  } catch {
    return NextResponse.json({ ok: false, maintenanceMode: false }, { status: 503 });
  }
}
