import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Alias → emergency-stop (B7). */
export async function POST(request: NextRequest) {
  const mod = await import("../emergency-stop/route");
  return mod.POST(request);
}
