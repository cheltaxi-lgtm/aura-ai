import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import type { AuthPayload } from "@/lib/auth";
import { requireAdsEnabled } from "../gate";

/** requireAdsEnabled + requireAdmin. Returns auth or an error response. */
export async function requireAdsAdmin(): Promise<
  { auth: AuthPayload } | NextResponse
> {
  const gated = await requireAdsEnabled();
  if (gated) return gated;
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return { auth };
}

export function isAdsAdminAuth(
  v: { auth: AuthPayload } | NextResponse
): v is { auth: AuthPayload } {
  return !(v instanceof NextResponse) && "auth" in v;
}
