import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { requireAdminStepUp } from "@/lib/admin-stepup";
import type { AuthPayload } from "@/lib/auth";
import { requireAdsEnabled } from "../gate";

/**
 * Admin access for Ads UI.
 * Authenticated admins always reach /admin/ads (so flags can be toggled).
 * Public beacon / spend still gated by ads.enabled + requireEnabled paths.
 * - requireEnabled:true → 404 unless ads.enabled (rare write paths)
 * - stepUpRequest: password / step-up cookie for destructive writes
 */
export async function requireAdsAdmin(opts?: {
  requireEnabled?: boolean;
  stepUpRequest?: NextRequest;
}): Promise<{ auth: AuthPayload } | NextResponse> {
  let auth: AuthPayload | null = null;
  if (opts?.stepUpRequest) {
    const stepped = await requireAdminStepUp(opts.stepUpRequest);
    if (!stepped.ok) return stepped.response;
    auth = stepped.auth;
  } else {
    auth = await requireAdmin();
    if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
