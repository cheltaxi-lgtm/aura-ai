import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const features = await getSetting("features");
    return NextResponse.json({
      ok: true,
      maintenanceMode: features.maintenanceMode === true,
    });
  } catch {
    /* Settings/DB hiccup — inconclusive, not a hard-down signal for connectivity probes. */
    return NextResponse.json({ ok: false, maintenanceMode: false }, { status: 200 });
  }
}
