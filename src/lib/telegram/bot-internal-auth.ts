import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const BOT_INTERNAL_SECRET_HEADER = "x-bot-internal-secret";

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getBotInternalSecret(): string {
  return process.env.BOT_INTERNAL_SECRET?.trim() || "";
}

/** Authenticate bot→site internal calls. Secret must match BOT_INTERNAL_SECRET. */
export function assertBotInternalAuth(request: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = getBotInternalSecret();
  if (!expected) {
    return { ok: false, status: 503, error: "internal_bot_disabled" };
  }
  const provided = request.headers.get(BOT_INTERNAL_SECRET_HEADER)?.trim() || "";
  if (!provided || !secretsMatch(provided, expected)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

export function parseTelegramUserId(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}
