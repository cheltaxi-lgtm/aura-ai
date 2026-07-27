import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

import { clientIp } from "@/lib/api-guards";
import { formatUserQuestionForPrompt } from "@/lib/chat-sanitize";
import { getDeckDefinition, getDeckPositions } from "@/lib/decks";
import type { SpreadSymbol } from "@/lib/decks/types";
import type {
  GuestResumeCardsPayload,
  GuestResumeTeaserRecord,
} from "@/lib/guest-triplet-receipt";
import {
  findGuestResumeTeaserByCacheKey,
  updateGuestResumeCardsPayload,
  type GuestResumeSessionRow,
} from "@/lib/guest-triplet-receipt-db";
import { buildGuestTripletPreview } from "@/lib/guest-triplet-teaser";
import {
  buildGuestTeaserSystemPrompt,
  buildGuestTeaserUserPrompt,
  GUEST_TEASER_PROMPT_VERSION,
  TEASER_BANNED_PHRASES,
} from "@/lib/guest-triplet-teaser-prompt";
import { completeChatDetailed } from "@/lib/llm";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const TEASER_QUESTION_PROMPT_MAX = 300;
export const TEASER_MAX_CHARS = 720;
export const TEASER_MIN_CHARS = 80;
export const TEASER_TIMEOUT_MS = 7000;
export const TEASER_MAX_TOKENS = 220;
export const TEASER_RECEIPT_MIN_AGE_MS = 3_000;
export const TEASER_RECEIPT_MAX_AGE_MS = 30 * 60_000;
const TEASER_CONCURRENCY_CAP = 5;
const TEASER_MAX_FAILS = 2;
/** One quality-driven regeneration max per receipt (total ≤2 LLM calls). */
const TEASER_QUALITY_REGEN_MAX = 1;

const BOT_UA_RE =
  /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|discord|preview|headless|phantom|selenium|puppeteer|scrapy|curl\/|wget|python-requests|go-http-client|httpclient|okhttp|java\/|libwww/i;

type TeaserMetrics = {
  teaser_llm_calls: number;
  teaser_fallback_count: number;
  teaser_cache_hits: number;
  teaser_gate_skipped: number;
  teaser_tokens_in: number;
  teaser_tokens_out: number;
  teaser_rate_limited: number;
};

const metricsHour: TeaserMetrics = emptyMetrics();
const metricsDay: TeaserMetrics = emptyMetrics();
let metricsHourReset = Date.now() + 3_600_000;
let metricsDayReset = Date.now() + 86_400_000;
let teaserInflight = 0;

const memoryCache = new Map<string, { text: string; model: string; createdAt: string }>();

function emptyMetrics(): TeaserMetrics {
  return {
    teaser_llm_calls: 0,
    teaser_fallback_count: 0,
    teaser_cache_hits: 0,
    teaser_gate_skipped: 0,
    teaser_tokens_in: 0,
    teaser_tokens_out: 0,
    teaser_rate_limited: 0,
  };
}

function bump(metric: keyof TeaserMetrics, by = 1): void {
  const now = Date.now();
  if (now >= metricsHourReset) {
    Object.assign(metricsHour, emptyMetrics());
    metricsHourReset = now + 3_600_000;
  }
  if (now >= metricsDayReset) {
    Object.assign(metricsDay, emptyMetrics());
    metricsDayReset = now + 86_400_000;
  }
  metricsHour[metric] += by;
  metricsDay[metric] += by;
}

export function getTeaserMetricsSnapshot() {
  return {
    hour: { ...metricsHour },
    day: { ...metricsDay },
    inflight: teaserInflight,
  };
}

export function isTeaserLlmEnabled(): boolean {
  const v = process.env.TEASER_LLM_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function teaserMinQuestionLength(): number {
  const n = Number(process.env.TEASER_MIN_QUESTION_LENGTH);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 15;
}

export function teaserDailyBudgetCalls(): number {
  const n = Number(process.env.TEASER_DAILY_BUDGET_CALLS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 300;
}

export function teaserModelName(): string {
  return process.env.TEASER_MODEL?.trim() || "openai/gpt-4o-mini";
}

/** Owner thresholds: disable TEASER_LLM_ENABLED when day hits these. */
export const TEASER_OWNER_DISABLE_THRESHOLDS = {
  dailyCalls: 300,
  dailyTokensOut: 60_000,
  hourlyRateLimited: 80,
} as const;

export function normalizeTeaserQuestion(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(.)\1{2,}/g, "$1$1");
}

export function evaluateTeaserQuestionGate(
  question: string
): { ok: true; normalized: string } | { ok: false; reason: string } {
  const normalized = normalizeTeaserQuestion(question);
  if (normalized.length < teaserMinQuestionLength()) {
    return { ok: false, reason: "too_short" };
  }
  const words = normalized.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length < 2) {
    return { ok: false, reason: "too_few_words" };
  }
  if (!/[\p{L}]/u.test(normalized)) {
    return { ok: false, reason: "digits_or_punct_only" };
  }
  return { ok: true, normalized };
}

export function truncateTeaserText(text: string, maxChars = TEASER_MAX_CHARS): string {
  const cleaned = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[#*_`]/g, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  const slice = cleaned.slice(0, maxChars);
  const lastStop = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf("?"));
  if (lastStop >= Math.floor(maxChars * 0.55)) {
    return slice.slice(0, lastStop + 1).trim();
  }
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim();
}

export function buildTeaserCacheKey(questionNormalized: string, cardIds: number[]): string {
  const base = `${GUEST_TEASER_PROMPT_VERSION}|${questionNormalized.toLowerCase()}|${cardIds.join(",")}`;
  return createHash("sha256").update(base).digest("hex").slice(0, 32);
}

const POSITION_SENTENCE_RE =
  /^\s*(в\s+вашем\s+)?(прошлом|настоящем|будущем)\b/i;

export type TeaserQualityResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Server-side quality gate for LLM teaser text.
 * Exported for regression: old dictionary-style prod text must fail.
 */
export function validateGuestTeaserQuality(
  text: string,
  cardNames: string[]
): TeaserQualityResult {
  const cleaned = truncateTeaserText(text);
  if (cleaned.length < TEASER_MIN_CHARS) {
    return { ok: false, reason: "too_short" };
  }
  if (cleaned.length > TEASER_MAX_CHARS) {
    return { ok: false, reason: "too_long" };
  }

  const lower = cleaned.toLowerCase();
  for (const phrase of TEASER_BANNED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      return { ok: false, reason: `banned:${phrase}` };
    }
  }

  const sentences = cleaned
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let positionHits = 0;
  for (const sentence of sentences) {
    if (POSITION_SENTENCE_RE.test(sentence)) positionHits += 1;
  }
  if (positionHits >= 2) {
    return { ok: false, reason: "position_scaffold" };
  }

  let cardMentions = 0;
  for (const name of cardNames) {
    const n = name.trim();
    if (n.length < 2) continue;
    const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = cleaned.match(re);
    if (matches) cardMentions += matches.length;
  }
  if (cardMentions > 1) {
    return { ok: false, reason: "too_many_card_names" };
  }

  return { ok: true };
}

export function hashIpUa(ip: string, ua: string): string {
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 24);
}

function receiptIssuedAtMs(row: GuestResumeSessionRow): number | null {
  const created = row.created_at;
  if (created instanceof Date) return created.getTime();
  if (typeof created === "string" || typeof created === "number") {
    const t = new Date(created).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (row.guest_resume_expires_at) {
    const exp =
      row.guest_resume_expires_at instanceof Date
        ? row.guest_resume_expires_at.getTime()
        : new Date(row.guest_resume_expires_at).getTime();
    if (Number.isFinite(exp)) {
      // expires = issued + 24h
      return exp - 24 * 60 * 60 * 1000;
    }
  }
  return null;
}

export function assertReceiptAgeForTeaser(
  row: GuestResumeSessionRow
): { ok: true } | { ok: false; reason: string } {
  const issued = receiptIssuedAtMs(row);
  if (issued == null) return { ok: false, reason: "unknown_age" };
  const age = Date.now() - issued;
  if (age < TEASER_RECEIPT_MIN_AGE_MS) return { ok: false, reason: "too_fresh" };
  if (age > TEASER_RECEIPT_MAX_AGE_MS) return { ok: false, reason: "too_old" };
  return { ok: true };
}

export function assertTeaserRequestAllowed(
  request: NextRequest
): { ok: true } | { ok: false; reason: string } {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua.trim() || BOT_UA_RE.test(ua)) {
    return { ok: false, reason: "bot_ua" };
  }
  const referer = request.headers.get("referer") ?? "";
  const origin = request.headers.get("origin") ?? "";
  const secFetchSite = request.headers.get("sec-fetch-site") ?? "";
  const hostOk = (value: string) => {
    try {
      const u = new URL(value);
      return (
        u.hostname === "zovus.ru" ||
        u.hostname === "www.zovus.ru" ||
        u.hostname === "localhost" ||
        u.hostname === "127.0.0.1"
      );
    } catch {
      return false;
    }
  };
  const capacitor = /capacitor|wv\)|android.*zovus|zovus.*android/i.test(ua);
  if (capacitor) return { ok: true };
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") return { ok: true };
  if (referer && hostOk(referer)) return { ok: true };
  if (origin && hostOk(origin)) return { ok: true };
  if (process.env.NODE_ENV !== "production") return { ok: true };
  return { ok: false, reason: "missing_referer" };
}

export function buildKeywordFallbackText(payload: GuestResumeCardsPayload): string {
  const positions = getDeckPositions(payload.system);
  const deck = getDeckDefinition(payload.system).symbols;
  const byId = new Map(deck.map((c) => [c.id, c]));
  const cards: SpreadSymbol[] = [...payload.symbols]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const def = byId.get(s.id);
      return {
        id: s.id,
        name: s.name || def?.name || `Карта ${s.id}`,
        meaning: def?.meaning ?? s.name,
        reversed: s.reversed,
      };
    });
  return buildGuestTripletPreview(cards, positions);
}

export function buildKeywordFallbackFromDeck(
  cards: SpreadSymbol[],
  system: GuestResumeCardsPayload["system"]
): string {
  return buildGuestTripletPreview(cards, getDeckPositions(system));
}

export type GuestTeaserResult = {
  text: string;
  isFallback: boolean;
  source:
    | "stored"
    | "cache"
    | "llm"
    | "gate"
    | "disabled"
    | "budget"
    | "rate_limit"
    | "concurrency"
    | "age"
    | "antibot"
    | "failed"
    | "timeout"
    | "error";
  promptVersion?: string;
  model?: string;
};

async function markTeaserAttempt(
  sessionId: string,
  payload: GuestResumeCardsPayload,
  failed: boolean
): Promise<GuestResumeCardsPayload> {
  const attempts = (payload.teaserAttempts ?? 0) + (failed ? 1 : 0);
  const next: GuestResumeCardsPayload = {
    ...payload,
    teaserAttempts: attempts,
    teaserFailed: failed && attempts >= TEASER_MAX_FAILS ? true : payload.teaserFailed,
  };
  await updateGuestResumeCardsPayload(sessionId, next);
  return next;
}

async function persistTeaser(
  sessionId: string,
  payload: GuestResumeCardsPayload,
  record: GuestResumeTeaserRecord
): Promise<void> {
  const next: GuestResumeCardsPayload = {
    ...payload,
    teaser: record,
    teaserAttempts: payload.teaserAttempts ?? 0,
  };
  await updateGuestResumeCardsPayload(sessionId, next);
  memoryCache.set(record.cacheKey || record.text.slice(0, 32), {
    text: record.text,
    model: record.model,
    createdAt: record.createdAt,
  });
}

/**
 * Resolve guest teaser for a validated issued/claimed resume session.
 * Never throws product errors — returns keyword fallback with isFallback.
 */
export async function resolveGuestTeaser(input: {
  request: NextRequest;
  row: GuestResumeSessionRow;
  payload: GuestResumeCardsPayload;
  /** Optional deck meanings for richer keyword fallback. */
  deckMeanings?: SpreadSymbol[];
}): Promise<GuestTeaserResult> {
  const { request, row, payload } = input;
  const fallbackText = input.deckMeanings?.length
    ? buildKeywordFallbackFromDeck(input.deckMeanings, payload.system)
    : buildKeywordFallbackText(payload);

  const returnFallback = (source: GuestTeaserResult["source"]): GuestTeaserResult => {
    bump("teaser_fallback_count");
    return { text: fallbackText, isFallback: true, source };
  };

  // Idempotent success path
  if (payload.teaser?.text) {
    return {
      text: payload.teaser.text,
      isFallback: false,
      source: "stored",
      promptVersion: payload.teaser.promptVersion,
      model: payload.teaser.model,
    };
  }

  if (payload.teaserFailed) {
    return returnFallback("failed");
  }

  if (!isTeaserLlmEnabled()) {
    return returnFallback("disabled");
  }

  const antibot = assertTeaserRequestAllowed(request);
  if (!antibot.ok) {
    bump("teaser_rate_limited");
    return returnFallback("antibot");
  }

  const age = assertReceiptAgeForTeaser(row);
  if (!age.ok) {
    return returnFallback("age");
  }

  const gate = evaluateTeaserQuestionGate(payload.question);
  if (!gate.ok) {
    bump("teaser_gate_skipped");
    console.info(
      JSON.stringify({
        event: "teaser_gate_skipped",
        reason: gate.reason,
        receipt_id: row.id,
      })
    );
    return returnFallback("gate");
  }

  const cardIds = [...payload.symbols]
    .sort((a, b) => a.position - b.position)
    .map((s) => s.id);
  const cacheKey = buildTeaserCacheKey(gate.normalized, cardIds);

  const mem = memoryCache.get(cacheKey);
  if (mem?.text) {
    bump("teaser_cache_hits");
    const record: GuestResumeTeaserRecord = {
      text: mem.text,
      promptVersion: GUEST_TEASER_PROMPT_VERSION,
      model: mem.model,
      createdAt: mem.createdAt,
      cacheKey,
    };
    await persistTeaser(row.id, payload, record);
    return {
      text: mem.text,
      isFallback: false,
      source: "cache",
      promptVersion: GUEST_TEASER_PROMPT_VERSION,
      model: mem.model,
    };
  }

  const dbCached = await findGuestResumeTeaserByCacheKey(cacheKey);
  if (
    dbCached?.text &&
    dbCached.promptVersion === GUEST_TEASER_PROMPT_VERSION
  ) {
    bump("teaser_cache_hits");
    memoryCache.set(cacheKey, {
      text: dbCached.text,
      model: dbCached.model,
      createdAt: dbCached.createdAt,
    });
    await persistTeaser(row.id, payload, { ...dbCached, cacheKey });
    return {
      text: dbCached.text,
      isFallback: false,
      source: "cache",
      promptVersion: dbCached.promptVersion,
      model: dbCached.model,
    };
  }

  let workingPayload = payload;
  const attempts = workingPayload.teaserAttempts ?? 0;
  if (attempts >= TEASER_MAX_FAILS || workingPayload.teaserFailed) {
    const failedPayload = { ...workingPayload, teaserFailed: true };
    await updateGuestResumeCardsPayload(row.id, failedPayload);
    return returnFallback("failed");
  }

  const questionForPrompt = formatUserQuestionForPrompt(gate.normalized, TEASER_QUESTION_PROMPT_MAX);
  const positions = getDeckPositions(payload.system);
  const cardLines = [...payload.symbols]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      name: s.name,
      positionLabel: positions[s.position] ?? `Позиция ${s.position + 1}`,
      reversed: s.reversed,
    }));
  const cardNames = cardLines.map((c) => c.name);
  const model = teaserModelName();
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const ipHash = hashIpUa(ip, ua);

  const reserveGenerationSlot = async (): Promise<
    { ok: true } | { ok: false; source: GuestTeaserResult["source"] }
  > => {
    if (teaserInflight >= TEASER_CONCURRENCY_CAP) {
      bump("teaser_rate_limited");
      return { ok: false, source: "concurrency" };
    }
    const hourLimit = await checkRateLimit(rateLimitKey("teaser_ip_h", ipHash), 3, 3_600_000);
    if (!hourLimit.allowed) {
      bump("teaser_rate_limited");
      return { ok: false, source: "rate_limit" };
    }
    const dayLimit = await checkRateLimit(rateLimitKey("teaser_ip_d", ipHash), 10, 86_400_000);
    if (!dayLimit.allowed) {
      bump("teaser_rate_limited");
      return { ok: false, source: "rate_limit" };
    }
    const dayKey = new Date().toISOString().slice(0, 10);
    const budget = await checkRateLimit(
      rateLimitKey("teaser_budget", dayKey),
      teaserDailyBudgetCalls(),
      86_400_000
    );
    if (!budget.allowed) {
      bump("teaser_rate_limited");
      return { ok: false, source: "budget" };
    }
    return { ok: true };
  };

  const runLlmOnce = async (): Promise<{
    text: string | null;
    timedOut: boolean;
    blocked?: GuestTeaserResult["source"];
  }> => {
    const slot = await reserveGenerationSlot();
    if (!slot.ok) return { text: null, timedOut: false, blocked: slot.source };

    teaserInflight += 1;
    try {
      const result = await completeChatDetailed({
        messages: [
          { role: "system", content: buildGuestTeaserSystemPrompt() },
          {
            role: "user",
            content: buildGuestTeaserUserPrompt({
              question: questionForPrompt,
              cards: cardLines,
            }),
          },
        ],
        maxTokens: TEASER_MAX_TOKENS,
        temperature: 0.65,
        timeoutMs: TEASER_TIMEOUT_MS,
        maxAttempts: 1,
        skipTemperatureRetry: true,
        modelOverride: model,
        priority: "background",
      });

      const usageIn = result.usage?.promptTokens ?? 0;
      const usageOut = result.usage?.completionTokens ?? 0;
      bump("teaser_llm_calls");
      bump("teaser_tokens_in", usageIn);
      bump("teaser_tokens_out", usageOut);
      console.info(
        JSON.stringify({
          event: "teaser_llm_call",
          model,
          receipt_id: row.id,
          ip_hash: ipHash,
          input_tokens: usageIn,
          output_tokens: usageOut,
          cache_key: cacheKey,
          prompt_version: GUEST_TEASER_PROMPT_VERSION,
        })
      );

      const text = truncateTeaserText(result.text ?? "");
      return { text: text || null, timedOut: result.text == null };
    } finally {
      teaserInflight = Math.max(0, teaserInflight - 1);
    }
  };

  try {
    let qualityRegens = 0;
    for (;;) {
      const { text, timedOut, blocked } = await runLlmOnce();
      if (blocked) return returnFallback(blocked);
      if (!text) {
        workingPayload = await markTeaserAttempt(row.id, workingPayload, true);
        return returnFallback(timedOut ? "timeout" : "error");
      }

      const quality = validateGuestTeaserQuality(text, cardNames);
      if (quality.ok) {
        const record: GuestResumeTeaserRecord = {
          text,
          promptVersion: GUEST_TEASER_PROMPT_VERSION,
          model,
          createdAt: new Date().toISOString(),
          cacheKey,
        };
        await persistTeaser(row.id, workingPayload, record);
        return {
          text,
          isFallback: false,
          source: "llm",
          promptVersion: GUEST_TEASER_PROMPT_VERSION,
          model,
        };
      }

      console.info(
        JSON.stringify({
          event: "teaser_quality_rejected",
          reason: quality.reason,
          receipt_id: row.id,
          prompt_version: GUEST_TEASER_PROMPT_VERSION,
          regen: qualityRegens,
        })
      );
      workingPayload = await markTeaserAttempt(row.id, workingPayload, true);

      if (qualityRegens >= TEASER_QUALITY_REGEN_MAX) {
        return returnFallback("error");
      }
      if ((workingPayload.teaserAttempts ?? 0) >= TEASER_MAX_FAILS) {
        return returnFallback("failed");
      }
      qualityRegens += 1;
      // One quality regen only — still subject to fails-per-receipt.
    }
  } catch (err) {
    console.warn(
      "[guest-teaser] llm failed",
      err instanceof Error ? err.message : "error"
    );
    await markTeaserAttempt(row.id, workingPayload, true);
    return returnFallback("error");
  }
}

/** Continuity block for full reading after auth. */
export function buildTeaserContinuityPromptBlock(teaserText: string): string {
  const clipped = truncateTeaserText(teaserText, 900);
  return [
    "",
    "<guest_teaser_shown>",
    "Клиенту уже показан этот краткий ориентир до регистрации:",
    clipped,
    "Не противоречь этому тезису. Углуби его по тем же картам. Не повторяй дословно.",
    "</guest_teaser_shown>",
  ].join("\n");
}
