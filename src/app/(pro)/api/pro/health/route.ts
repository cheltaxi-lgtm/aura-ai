import { NextResponse } from "next/server";
import { requireProEnabled } from "@/modules/pro/gate";
import { isProModuleEnabled } from "@/modules/pro/config";

/** S0 health stub — 404 when module dark. */
export async function GET() {
  const gated = requireProEnabled();
  if (gated) return gated;
  return NextResponse.json({
    ok: true,
    service: "zovus-pro",
    enabled: isProModuleEnabled(),
  });
}
