import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

const CHAT_LIMIT = 20;
const CHAT_WINDOW_MS = 60_000;

export async function enforceChatRateLimit(accountId: string): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("chat", accountId),
    CHAT_LIMIT,
    CHAT_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", retryAfterSec },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 60) } }
    );
  }
  return null;
}

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

import { MAX_CHAT_HISTORY, MAX_USER_MESSAGE_LENGTH } from "@/lib/chat-sanitize";

export const MAX_CHAT_MESSAGE_LENGTH = MAX_USER_MESSAGE_LENGTH;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_GEN_LIMIT = 8;
const IMAGE_GEN_WINDOW_MS = 60 * 60 * 1000;

export const PAID_ROUTE_LIMITS = {
  reading: { max: 10, windowMs: 60_000 },
  photo_reading: { max: 5, windowMs: 60_000 },
  intention_spread: { max: 10, windowMs: 60_000 },
  image_generate: { max: IMAGE_GEN_LIMIT, windowMs: IMAGE_GEN_WINDOW_MS },
  daily_bonus: { max: 1, windowMs: 86_400_000 },
  rune_purchase: { max: 10, windowMs: 3_600_000 },
} as const;

export type PaidRateLimitAction = keyof typeof PAID_ROUTE_LIMITS;

function rateLimitResponse(
  action: PaidRateLimitAction,
  retryAfterSec?: number
): NextResponse {
  const fallback = Math.ceil(PAID_ROUTE_LIMITS[action].windowMs / 1000);
  const retryAfter = retryAfterSec ?? fallback;
  return NextResponse.json(
    { error: "rate_limit", action, retryAfter, retryAfterSec: retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

export async function enforcePaidRouteRateLimit(
  accountId: string,
  action: PaidRateLimitAction
): Promise<NextResponse | null> {
  const limit = PAID_ROUTE_LIMITS[action];
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey(action, accountId),
    limit.max,
    limit.windowMs
  );
  if (!allowed) {
    return rateLimitResponse(action, retryAfterSec);
  }
  return null;
}

export async function enforceImageGenRateLimit(accountId: string): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("image_generate", accountId),
    IMAGE_GEN_LIMIT,
    IMAGE_GEN_WINDOW_MS
  );
  if (!allowed) {
    return rateLimitResponse("image_generate", retryAfterSec);
  }
  return null;
}

const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateImageMime(mimeType: string | undefined): NextResponse | null {
  const mime = (mimeType ?? "image/jpeg").toLowerCase().split(";")[0]?.trim();
  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    return NextResponse.json({ error: "invalid_image_type" }, { status: 400 });
  }
  return null;
}

/** Validates base64 payload matches a known image magic prefix. */
export function validateImageBase64Payload(base64: string): NextResponse | null {
  const trimmed = base64.replace(/^data:image\/\w+;base64,/, "").trim();
  if (!trimmed) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }
  const head = trimmed.slice(0, 16);
  const ok =
    head.startsWith("/9j/") ||
    head.startsWith("iVBORw0KG") ||
    head.startsWith("UklGR");
  if (!ok) {
    return NextResponse.json({ error: "invalid_image_format" }, { status: 400 });
  }
  return null;
}

export function validateLastUserMessage(
  messages: { role: string; content: string }[]
): NextResponse | null {
  const last = messages[messages.length - 1];
  if (last?.role === "user" && last.content.length > MAX_CHAT_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "message_too_long" }, { status: 400 });
  }
  if (messages.length > MAX_CHAT_HISTORY) {
    return NextResponse.json({ error: "history_too_long" }, { status: 400 });
  }
  return null;
}

const DAILY_CARD_LIMIT = 15;
const DAILY_CARD_WINDOW_MS = 60 * 60 * 1000;

export async function enforceDailyCardRateLimit(key: string): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("daily-card", key),
    DAILY_CARD_LIMIT,
    DAILY_CARD_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", retryAfterSec },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 3600) } }
    );
  }
  return null;
}

const INFLUENCER_REGISTER_LIMIT = 5;
const INFLUENCER_REGISTER_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function enforceInfluencerRegisterRateLimit(ip: string): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("influencer-register", ip),
    INFLUENCER_REGISTER_LIMIT,
    INFLUENCER_REGISTER_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много попыток регистрации" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 86400) } }
    );
  }
  return null;
}

const TTS_LIMIT = 30;
const TTS_WINDOW_MS = 60 * 60 * 1000;

export async function enforceTtsRateLimit(accountId: string): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("tts", accountId),
    TTS_LIMIT,
    TTS_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", retryAfterSec },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 3600) } }
    );
  }
  return null;
}

const STT_LIMIT = 30;
const STT_WINDOW_MS = 60 * 60 * 1000;

export async function enforceSttRateLimit(accountId: string): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("stt", accountId),
    STT_LIMIT,
    STT_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", retryAfterSec, message: "Слишком много голосовых запросов." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 3600) } }
    );
  }
  return null;
}

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function enforceLoginRateLimit(ip: string): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("login", ip),
    LOGIN_LIMIT,
    LOGIN_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много попыток входа. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 900) } }
    );
  }
  return null;
}
