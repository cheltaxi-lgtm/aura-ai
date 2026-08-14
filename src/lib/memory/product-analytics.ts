import { query } from "@/lib/db";

export const MEMORY_PRODUCT_EVENTS = [
  "consent_prompt_shown",
  "consent_choice_enabled",
  "consent_choice_disabled",
  "memory_settings_changed",
  "fact_captured",
  "fact_draft_captured",
  "fact_confirmed",
  "fact_changed",
  "fact_forgotten",
  "fact_dismissed",
  "fact_feedback_positive",
  "fact_feedback_negative",
  "moments_mode_changed",
  "fresh_session_started",
  "memory_anchor_included",
  "memory_anchor_excluded",
  "memory_injected",
  "memory_retrieved",
  "memory_purged",
] as const;

export type MemoryProductEvent = (typeof MEMORY_PRODUCT_EVENTS)[number];
export const MEMORY_SOURCE_TYPES = ["reading", "photo", "ritual", "daily", "chat", "cabinet"] as const;
export const MEMORY_MOMENTS_MODES = ["active", "quiet"] as const;
export const MEMORY_FACT_CATEGORIES = [
  "identity",
  "relationship",
  "preference",
  "goal",
  "event",
  "wellbeing",
  "other",
] as const;
export const MEMORY_FACT_SOURCE_TYPES = ["manual", "extracted", "confirmed"] as const;
export const MEMORY_SENSITIVITIES = ["normal", "sensitive"] as const;

type Member<T extends readonly string[]> = T[number];

export interface MemoryProductEventInput {
  event: MemoryProductEvent;
  userId: string;
  accountId?: string | null;
  sessionId?: string | null;
  sourceType?: Member<typeof MEMORY_SOURCE_TYPES> | null;
  promptVersion?: string | null;
  consentVersion?: string | null;
  rolloutBucket?: number | null;
  variant?: string | null;
  memoryEnabled?: boolean | null;
  autoCaptureEnabled?: boolean | null;
  momentsMode?: Member<typeof MEMORY_MOMENTS_MODES> | null;
  factCategory?: Member<typeof MEMORY_FACT_CATEGORIES> | null;
  factSourceType?: Member<typeof MEMORY_FACT_SOURCE_TYPES> | null;
  sensitivity?: Member<typeof MEMORY_SENSITIVITIES> | null;
  numericValue?: number | null;
  /** Counts only — never fact text, names, or quotes. */
  metrics?: Record<string, number> | null;
}

const SAFE_TOKEN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

export function isSafeAnalyticsToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value);
}

export function toAnalyticsFactCategory(
  category: string | null | undefined
): Member<typeof MEMORY_FACT_CATEGORIES> {
  const value = (category ?? "").toLowerCase();
  if (/отнош|партн|сем|family|relationship/.test(value)) return "relationship";
  if (/цель|план|работ|учеб|goal|work|career|education/.test(value)) return "goal";
  if (/событ|переезд|поезд|event|travel|move/.test(value)) return "event";
  if (/здоров|самочув|health|wellbeing/.test(value)) return "wellbeing";
  if (/предпоч|preference/.test(value)) return "preference";
  if (/личн|имя|место|identity|profile|residence/.test(value)) return "identity";
  return "other";
}

/**
 * Best-effort recorder. Callers must never send memory text, evidence, prompts,
 * messages, names, email addresses, URLs, or arbitrary properties.
 */
const SAFE_METRIC_KEYS = new Set([
  "memory_candidates_count",
  "memory_selected_count",
  "memory_core_count",
  "memory_entity_matches_count",
  "memory_timeline_matches_count",
  "memory_archived_matches_count",
  "memory_context_chars",
  "memory_retrieval_ms",
]);

function safeMetricsJson(metrics?: Record<string, number> | null): string {
  if (!metrics) return "{}";
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (!SAFE_METRIC_KEYS.has(key)) continue;
    if (!Number.isFinite(value)) continue;
    out[key] = Math.round(value);
  }
  return JSON.stringify(out);
}

export async function recordMemoryProductEvent(input: MemoryProductEventInput): Promise<boolean> {
  try {
    await query(
      `INSERT INTO memory_product_events (
         event, user_id, account_id, session_id, source_type, prompt_version,
         consent_version, rollout_bucket, variant, memory_enabled,
         auto_capture_enabled, moments_mode, fact_category, fact_source_type,
         sensitivity, numeric_value, properties
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
         $17::jsonb
       )
       ON CONFLICT DO NOTHING`,
      [
        input.event,
        input.userId,
        input.accountId ?? null,
        input.sessionId ?? null,
        input.sourceType ?? null,
        input.promptVersion ?? null,
        input.consentVersion ?? null,
        input.rolloutBucket ?? null,
        input.variant ?? null,
        input.memoryEnabled ?? null,
        input.autoCaptureEnabled ?? null,
        input.momentsMode ?? null,
        input.factCategory ?? null,
        input.factSourceType ?? null,
        input.sensitivity ?? null,
        input.numericValue ?? null,
        safeMetricsJson(input.metrics),
      ]
    );
    return true;
  } catch {
    console.warn("memory product analytics write skipped");
    return false;
  }
}
