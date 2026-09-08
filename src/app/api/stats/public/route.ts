import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { testAccountEmailSql } from "@/lib/test-accounts";
import { clientIp } from "@/lib/api-guards";
import { checkRateLimitMemory, rateLimitKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type PublicStats = { sessions: number; users: number };
const CACHE_TTL_MS = 60 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 60 * 1000;
let statsCache: { value: PublicStats; expiresAt: number } | null = null;
let statsLoad: Promise<PublicStats> | null = null;

async function loadPublicStats(): Promise<PublicStats> {
  const now = Date.now();
  if (statsCache && statsCache.expiresAt > now) return statsCache.value;
  if (statsLoad) return statsLoad;

  statsLoad = (async () => {
    try {
      const { rows } = await query<{ sessions: string; users: string }>(`
        SELECT
          (SELECT COUNT(*) FROM sessions)::text AS sessions,
          (SELECT COUNT(*) FROM user_accounts ua WHERE NOT ${testAccountEmailSql("ua.email")})::text AS users
      `);
      const value = {
        sessions: Math.max(0, parseInt(rows[0]?.sessions ?? "0", 10)),
        users: Math.max(0, parseInt(rows[0]?.users ?? "0", 10)),
      };
      statsCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    } catch {
      const value = statsCache?.value ?? { sessions: 0, users: 0 };
      statsCache = { value, expiresAt: Date.now() + ERROR_CACHE_TTL_MS };
      return value;
    } finally {
      statsLoad = null;
    }
  })();
  return statsLoad;
}

export async function GET(request: NextRequest) {
  const rate = checkRateLimitMemory(
    rateLimitKey("public_stats", clientIp(request)),
    120,
    60_000
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limit", retryAfterSec: rate.retryAfterSec },
      {
        status: 429,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": String(rate.retryAfterSec ?? 60),
        },
      }
    );
  }

  try {
    const stats = await loadPublicStats();
    return NextResponse.json(
      stats,
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    return NextResponse.json({ sessions: 0, users: 0 });
  }
}
