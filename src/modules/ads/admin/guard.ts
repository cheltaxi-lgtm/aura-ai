import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import type { AuthPayload } from "@/lib/auth";
import { requireAdsEnabled } from "../gate";

/**
 * Admin access for Ads UI.
 * Authenticated admins always reach /admin/ads (so flags can be toggled).
 * Public beacon / spend still gated by ads.enabled + requireEnabled paths.
 * - requireEnabled:true → 404 unless ads.enabled (rare write paths)
 */
export async function requireAdsAdmin(opts?: {
  requireEnabled?: boolean;
}): Promise<{ auth: AuthPayload } | NextResponse> {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (opts?.requireEnabled) {
    const gated = await requireAdsEnabled();
    if (gated) return gated;
  }
  return { auth };
}

export function isAdsAdminAuth(
  v: { auth: AuthPayload } | NextResponse
): v is { auth: AuthPayload } {
  return !(v instanceof NextResponse) && "auth" in v;
}
