import { isInsufficientRunesError } from "@/lib/insufficient-runes";

export function getRateLimitPayload(data: unknown): {
  action?: string;
  retryAfter?: number;
} | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { error?: string; action?: string; retryAfter?: number; retryAfterSec?: number };
  if (d.error !== "rate_limit") return null;
  return {
    action: d.action,
    retryAfter: d.retryAfter ?? d.retryAfterSec,
  };
}

export function parseInsufficientRunes(data: unknown): {
  balance: number;
  required: number;
  shortage: number;
} | null {
  if (!isInsufficientRunesError(data)) return null;
  const balance = data.balance ?? 0;
  const required = data.required ?? 0;
  const shortage = data.shortage ?? Math.max(0, required - balance);
  return { balance, required, shortage };
}
