import { NextRequest, NextResponse } from "next/server";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { ensureDb, query } from "@/lib/db";
import {
  MEMORY_FACT_CATEGORIES,
  MEMORY_FACT_SOURCE_TYPES,
  MEMORY_MOMENTS_MODES,
  MEMORY_PRODUCT_EVENTS,
  MEMORY_SENSITIVITIES,
  MEMORY_SOURCE_TYPES,
  isSafeAnalyticsToken,
  recordMemoryProductEvent,
  type MemoryProductEventInput,
} from "@/lib/memory/product-analytics";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requireUserAuth } from "@/lib/require-auth";

export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_KEYS = new Set([
  "event", "sessionId", "sourceType", "promptVersion", "consentVersion", "variant",
  "memoryEnabled", "autoCaptureEnabled", "momentsMode", "factCategory",
  "factSourceType", "sensitivity", "numericValue",
]);
const inList = <T extends readonly string[]>(list: T, value: unknown): value is T[number] =>
  typeof value === "string" && (list as readonly string[]).includes(value);

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4_096) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (!(await ensureDb())) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });

  const limit = await checkRateLimit(rateLimitKey("memory_product_analytics", auth.sub), 120, 60 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limit", retryAfterSec: limit.retryAfterSec }, { status: 429 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some((key) => !ALLOWED_KEYS.has(key))) {
    return NextResponse.json({ error: "unknown_dimension" }, { status: 400 });
  }
  if (!inList(MEMORY_PRODUCT_EVENTS, value.event)) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }
  const invalidEnum =
    (value.sourceType !== undefined && !inList(MEMORY_SOURCE_TYPES, value.sourceType)) ||
    (value.momentsMode !== undefined && !inList(MEMORY_MOMENTS_MODES, value.momentsMode)) ||
    (value.factCategory !== undefined && !inList(MEMORY_FACT_CATEGORIES, value.factCategory)) ||
    (value.factSourceType !== undefined && !inList(MEMORY_FACT_SOURCE_TYPES, value.factSourceType)) ||
    (value.sensitivity !== undefined && !inList(MEMORY_SENSITIVITIES, value.sensitivity));
  if (invalidEnum) return NextResponse.json({ error: "invalid_dimension" }, { status: 400 });

  const userId = await getProfileUserIdForAccount(auth.sub);
  if (!userId) return NextResponse.json({ error: "profile_required" }, { status: 400 });

  const sessionId = typeof value.sessionId === "string" && UUID_RE.test(value.sessionId) ? value.sessionId : null;
  if (value.sessionId !== undefined && !sessionId) {
    return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  }
  if (sessionId) {
    const owned = await query("SELECT 1 FROM sessions WHERE id = $1 AND user_id = $2", [sessionId, userId]);
    if (!owned.rowCount) return NextResponse.json({ error: "invalid_session" }, { status: 400 });
  }

  const optionalToken = (key: string): string | null | undefined => {
    if (value[key] === undefined) return undefined;
    return isSafeAnalyticsToken(value[key]) ? value[key] : null;
  };
  const promptVersion = optionalToken("promptVersion");
  const consentVersion = optionalToken("consentVersion");
  const variant = optionalToken("variant");
  if (promptVersion === null || consentVersion === null || variant === null) {
    return NextResponse.json({ error: "invalid_dimension" }, { status: 400 });
  }

  const pref = await query<{
    memory_enabled: boolean;
    auto_capture_enabled: boolean;
    memory_moments_mode: "active" | "quiet";
    memory_rollout_bucket: number | null;
    memory_prompt_variant: string | null;
  }>(
    `SELECT memory_enabled, auto_capture_enabled, memory_moments_mode,
            memory_rollout_bucket, memory_prompt_variant
       FROM user_memory_preferences WHERE user_id = $1`,
    [userId]
  );
  const p = pref.rows[0];
  const bool = (key: string): boolean | null | undefined =>
    value[key] === undefined ? undefined : typeof value[key] === "boolean" ? value[key] : null;
  const memoryEnabled = bool("memoryEnabled");
  const autoCaptureEnabled = bool("autoCaptureEnabled");
  if (memoryEnabled === null || autoCaptureEnabled === null) {
    return NextResponse.json({ error: "invalid_dimension" }, { status: 400 });
  }
  if (value.numericValue !== undefined && (typeof value.numericValue !== "number" ||
      !Number.isFinite(value.numericValue) || Math.abs(value.numericValue) > 1_000_000)) {
    return NextResponse.json({ error: "invalid_numeric_value" }, { status: 400 });
  }

  const input: MemoryProductEventInput = {
    event: value.event,
    userId,
    accountId: auth.sub,
    sessionId,
    sourceType: inList(MEMORY_SOURCE_TYPES, value.sourceType) ? value.sourceType : undefined,
    promptVersion,
    consentVersion,
    rolloutBucket: p?.memory_rollout_bucket,
    variant: variant ?? p?.memory_prompt_variant,
    memoryEnabled: memoryEnabled ?? p?.memory_enabled,
    autoCaptureEnabled: autoCaptureEnabled ?? p?.auto_capture_enabled,
    momentsMode: inList(MEMORY_MOMENTS_MODES, value.momentsMode)
      ? value.momentsMode
      : p?.memory_moments_mode,
    factCategory: inList(MEMORY_FACT_CATEGORIES, value.factCategory) ? value.factCategory : undefined,
    factSourceType: inList(MEMORY_FACT_SOURCE_TYPES, value.factSourceType) ? value.factSourceType : undefined,
    sensitivity: inList(MEMORY_SENSITIVITIES, value.sensitivity) ? value.sensitivity : undefined,
    numericValue: typeof value.numericValue === "number" ? value.numericValue : undefined,
  };

  // The recorder catches storage failures; analytics is intentionally non-blocking.
  const recorded = await recordMemoryProductEvent(input);
  return NextResponse.json({ ok: true, recorded }, { status: 202 });
}
