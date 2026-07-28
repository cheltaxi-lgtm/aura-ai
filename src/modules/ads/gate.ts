import { NextResponse } from "next/server";
import { isAdsEnabled } from "./config";

/** When ads.enabled=false → 404 (module invisible). */
export async function requireAdsEnabled(): Promise<NextResponse | null> {
  if (await isAdsEnabled()) return null;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
