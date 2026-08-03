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

/**
 * Client IP for rate limits. Prefer the left-most X-Forwarded-For hop only when
 * TRUST_PROXY / production (Caddy overwrites these). Never prefer a bare
 * client-supplied X-Real-Ip ahead of the proxy chain — spoofable if Node is exposed.
 */
export function clientIp(request: NextRequest): string {
  const trustForwarded =
    process.env.TRUST_PROXY === "true" || process.env.NODE_ENV === "production";

  if (trustForwarded) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }

  return "unknown";
}

import { MAX_CHAT_HISTORY, MAX_USER_MESSAGE_LENGTH } from "@/lib/chat-sanitize";

export const MAX_CHAT_MESSAGE_LENGTH = MAX_USER_MESSAGE_LENGTH;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_GEN_LIMIT = 8;
const IMAGE_GEN_WINDOW_MS = 60 * 60 * 1000;

export const PAID_ROUTE_LIMITS = {
  reading: { max: 10, windowMs: 60_000 },
  numerolog_tool: { max: 12, windowMs: 60_000 },
  photo_reading: { max: 5, windowMs: 60_000 },
  /** Vision recognize is unbilled until interpret; tight caps + balance gate in the route. */
  photo_recognize: { max: 3, windowMs: 60_000 },
  photo_recognize_daily: { max: 24, windowMs: 86_400_000 },
  intention_spread: { max: 10, windowMs: 60_000 },
  image_generate: { max: IMAGE_GEN_LIMIT, windowMs: IMAGE_GEN_WINDOW_MS },
  daily_bonus: { max: 1, windowMs: 86_400_000 },
  rune_purchase: { max: 10, windowMs: 3_600_000 },
  /** Confirm/reconcile after YooKassa return — tighter than purchase create. */
  rune_confirm: { max: 30, windowMs: 60_000 },
  registration_attribution: { max: 10, windowMs: 60_000 },
  spread_metrics: { max: 120, windowMs: 60_000 },
  cabinet_notes: { max: 20, windowMs: 60_000 },
  ritual_create: { max: 10, windowMs: 60_000 },
  ritual_pay: { max: 10, windowMs: 60_000 },
  ritual_regenerate: { max: 8, windowMs: 60_000 },
  ritual_answer: { max: 30, windowMs: 60_000 },
  ritual_review: { max: 10, windowMs: 60_000 },
  joint_reading_create: { max: 10, windowMs: 60_000 },
  joint_reading_complete: { max: 10, windowMs: 60_000 },
  joint_reading_mine: { max: 30, windowMs: 60_000 },
  /** Unauthenticated GET, polled every 3s by both participants — capped per-IP, generous enough for normal use. */
  joint_reading_view: { max: 40, windowMs: 60_000 },
  natal_chart_read: { max: 30, windowMs: 60_000 },
  natal_chart_recompute: { max: 5, windowMs: 300_000 },
  natal_chart_interpretation: { max: 3, windowMs: 60_000 },
  natal_places: { max: 60, windowMs: 60_000 },
  natal_timing: { max: 6, windowMs: 60_000 },
  natal_history: { max: 30, windowMs: 60_000 },
  natal_report_delete: { max: 5, windowMs: 60_000 },
  numerology_matrix_report: { max: 30, windowMs: 60_000 },
  numerology_matrix_report_delete: { max: 10, windowMs: 60_000 },
  natal_forecast: { max: 3, windowMs: 60_000 },
  natal_ai_preferences: { max: 20, windowMs: 60_000 },
  natal_event_preferences: { max: 20, windowMs: 60_000 },
  natal_compatibility_read: { max: 30, windowMs: 60_000 },
  natal_compatibility_create: { max: 8, windowMs: 60_000 },
  natal_compatibility_accept: { max: 10, windowMs: 60_000 },
  natal_compatibility_generate: { max: 3, windowMs: 60_000 },
  natal_compatibility_delete: { max: 10, windowMs: 60_000 },
  report_share_public: { max: 60, windowMs: 60_000 },
  /** Unauthenticated share-landing API (reading excerpts). */
  share_public: { max: 60, windowMs: 60_000 },
  report_share_manage: { max: 20, windowMs: 60_000 },
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

export async function enforceSpreadMetricsRateLimit(ip: string): Promise<NextResponse | null> {
  const limit = PAID_ROUTE_LIMITS.spread_metrics;
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("spread_metrics", ip),
    limit.max,
    limit.windowMs
  );
  if (!allowed) {
    return rateLimitResponse("spread_metrics", retryAfterSec);
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

const SHARE_CREATE_LIMIT = 20;
const SHARE_CREATE_WINDOW_MS = 60 * 60 * 1000;

export async function enforceShareCreateRateLimit(key: string): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("share_create", key),
    SHARE_CREATE_LIMIT,
    SHARE_CREATE_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много ссылок для шаринга. Попробуйте позже." },
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

const TTS_LIMIT = 15;
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
const REGISTER_LIMIT = 8;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export async function enforceRegisterRateLimit(ip: string): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("register", ip),
    REGISTER_LIMIT,
    REGISTER_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много попыток регистрации. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 3600) } }
    );
  }
  return null;
}

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

const SESSION_CREATE_LIMIT = 20;
const SESSION_CREATE_WINDOW_MS = 60 * 60 * 1000;

export async function enforceSessionCreateRateLimit(ip: string): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("session_create", ip),
    SESSION_CREATE_LIMIT,
    SESSION_CREATE_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много сессий. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 3600) } }
    );
  }
  return null;
}

const GUEST_TRIPLET_COMPLETE_LIMIT = 8;
const GUEST_TRIPLET_COMPLETE_WINDOW_MS = 60 * 60 * 1000;
const GUEST_TRIPLET_CLAIM_LIMIT = 20;
const GUEST_TRIPLET_CLAIM_WINDOW_MS = 60 * 60 * 1000;

export async function enforceGuestTripletCompleteRateLimit(
  ip: string
): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("guest_triplet_complete", ip),
    GUEST_TRIPLET_COMPLETE_LIMIT,
    GUEST_TRIPLET_COMPLETE_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 3600) } }
    );
  }
  return null;
}

/** Guard against client boot loops hammering status (was taking down prod). */
export async function enforceGuestTripletStatusRateLimit(
  accountId: string
): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("guest_triplet_status", accountId),
    20,
    60_000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много запросов. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 60) } }
    );
  }
  return null;
}

export async function enforceGuestTripletClaimRateLimit(
  accountId: string
): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("guest_triplet_claim", accountId),
    GUEST_TRIPLET_CLAIM_LIMIT,
    GUEST_TRIPLET_CLAIM_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 3600) } }
    );
  }
  return null;
}
