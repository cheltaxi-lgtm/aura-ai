import type { NextRequest } from "next/server";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export async function checkOAuthRequestRateLimit(
  request: NextRequest,
  scope: string,
  limit: number,
  windowMs = 10 * 60 * 1000
) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return checkRateLimit(rateLimitKey(`oauth:${scope}`, ip), limit, windowMs);
}

export const OAUTH_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;
