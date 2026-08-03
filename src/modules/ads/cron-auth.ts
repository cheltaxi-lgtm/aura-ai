import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCronOrAdmin as requireCronOrAdminShared } from "@/lib/cron-auth";

/** Ads cron: timing-safe CRON_SECRET or admin session. */
export async function requireCronOrAdmin(
  request: NextRequest
): Promise<NextResponse | null> {
  return requireCronOrAdminShared(request);
}
