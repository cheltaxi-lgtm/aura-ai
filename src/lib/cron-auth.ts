import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when `x-cron-secret` matches CRON_SECRET (timing-safe, fail-closed if unset). */
export function isCronSecretValid(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
  if (!cronSecret) return false;
  const headerSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
  if (!headerSecret) return false;
  return secretsMatch(headerSecret, cronSecret);
}

/** Cron secret OR admin session. Returns a 401 response when neither is valid. */
export async function requireCronOrAdmin(
  request: NextRequest
): Promise<NextResponse | null> {
  if (isCronSecretValid(request)) return null;
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }
  return null;
}
