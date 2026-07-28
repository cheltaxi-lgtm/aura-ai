import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import type { AuthPayload } from "@/lib/auth";
import { requireAdsEnabled } from "../gate";
import { canAccessAdsAdmin } from "../config";

/**
 * Admin access for Ads UI.
 * - default: ads.enabled OR ads.observe (read/observe without spend)
 * - requireEnabled:true → beacon-level flag only (rare write paths)
 */
export async function requireAdsAdmin(opts?: {
  requireEnabled?: boolean;
}): Promise<{ auth: AuthPayload } | NextResponse> {
  if (opts?.requireEnabled) {
    const gated = await requireAdsEnabled();
    if (gated) return gated;
  } else {
    const ok = await canAccessAdsAdmin();
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return { auth };
}

export function isAdsAdminAuth(
  v: { auth: AuthPayload } | NextResponse
): v is { auth: AuthPayload } {
  return !(v instanceof NextResponse) && "auth" in v;
}
