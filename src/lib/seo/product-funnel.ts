/**
 * Unified public-product funnel stages — thin wrapper over Metrika reachGoal.
 * Params allowed: product, source, state only. Never PII / IDs / tokens.
 * Does not import metrika.ts (avoids circular dual-emit wrappers).
 */

import { utmParamsForMetrika } from "@/lib/utm/attribution";

const YANDEX_METRIKA_ID = 110138367;

declare global {
  interface Window {
    ym?: (id: number, method: string, ...args: unknown[]) => void;
  }
}

function reachGoal(goal: string, params?: Record<string, string>): void {
  if (typeof window === "undefined" || !window.ym) return;
  try {
    const withUtm = { ...utmParamsForMetrika(), ...params };
    window.ym(
      YANDEX_METRIKA_ID,
      "reachGoal",
      goal,
      Object.keys(withUtm).length ? withUtm : undefined
    );
  } catch {
    /* analytics optional */
  }
}

export const PRODUCT_FUNNEL_PRODUCTS = [
  "tarot",
  "matrix",
  "natal",
  "human_design",
  "matrix_compatibility",
  "aura",
  "palm",
] as const;

export type ProductFunnelProduct = (typeof PRODUCT_FUNNEL_PRODUCTS)[number];

export const PRODUCT_FUNNEL_STAGES = [
  "product_view",
  "free_start",
  "free_complete",
  "auth_cta",
  "claim_complete",
  "paid_cta",
] as const;

export type ProductFunnelStage = (typeof PRODUCT_FUNNEL_STAGES)[number];

export type ProductFunnelParams = {
  product: ProductFunnelProduct;
  source: string;
  state?: string;
};

const ALLOWED_PARAM_KEYS = new Set(["product", "source", "state"]);

const BLOCKED_KEY_RE =
  /name|birth|email|user|subject|artifact|token|question|card|place|lat|lon|coord|password|phone/i;

/** Strip anything that is not product/source/state; drop blocked keys/values. */
export function sanitizeProductFunnelParams(
  input: Record<string, unknown>
): { product: string; source: string; state?: string } | null {
  const product = typeof input.product === "string" ? input.product.trim() : "";
  const source = typeof input.source === "string" ? input.source.trim() : "";
  if (!product || !source) return null;
  if (!(PRODUCT_FUNNEL_PRODUCTS as readonly string[]).includes(product)) return null;
  if (BLOCKED_KEY_RE.test(source) || source.length > 64) return null;

  const out: { product: string; source: string; state?: string } = {
    product,
    source,
  };

  if (typeof input.state === "string" && input.state.trim()) {
    const state = input.state.trim().slice(0, 64);
    if (!BLOCKED_KEY_RE.test(state)) out.state = state;
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_PARAM_KEYS.has(key)) {
      // Explicitly ignored — never forwarded.
    }
  }

  return out;
}

export function trackProductFunnel(
  stage: ProductFunnelStage,
  params: ProductFunnelParams
): void {
  const clean = sanitizeProductFunnelParams(params as unknown as Record<string, unknown>);
  if (!clean) return;
  reachGoal(stage, clean);
}

export type PersonalZovusEvent =
  | "personal_home_view"
  | "personal_continue_click"
  | "personal_explore_click";

/** Personal Zovus home — product label only, never PII. */
export function trackPersonalZovusEvent(
  event: PersonalZovusEvent,
  params: { product?: ProductFunnelProduct | "daily" | "home"; source: string; state?: string }
): void {
  const product =
    typeof params.product === "string" && params.product.trim()
      ? params.product.trim()
      : "home";
  const source = typeof params.source === "string" ? params.source.trim() : "";
  if (!source || BLOCKED_KEY_RE.test(source) || source.length > 64) return;
  const payload: Record<string, string> = { product, source };
  if (params.state?.trim()) {
    const state = params.state.trim().slice(0, 64);
    if (!BLOCKED_KEY_RE.test(state)) payload.state = state;
  }
  reachGoal(event, payload);
}

/** Cross-product next-step CTA — product/source/state only, never PII. */
export function trackCrossProductClick(params: ProductFunnelParams): void {
  const clean = sanitizeProductFunnelParams(params as unknown as Record<string, unknown>);
  if (!clean) return;
  reachGoal("cross_product_click", clean);
}

const RETENTION_STATES = new Set(["d1", "d7", "later"]);

/**
 * Auth retention return (Personal Zovus). Params: product/source/state only.
 * Never send createdAt / userId / email.
 */
export function trackRetentionReturn(state: "d1" | "d7" | "later"): void {
  if (!RETENTION_STATES.has(state)) return;
  reachGoal("retention_return", {
    product: "home",
    source: "personal_zovus",
    state,
  });
}

/** Explicit daily-cards reminder opt-in/out. Params: product/source/state only. */
export function trackReminderOpt(enabled: boolean): void {
  reachGoal(enabled ? "reminder_opt_in" : "reminder_opt_out", {
    product: "tarot",
    source: "personal_zovus",
    state: "daily_cards",
  });
}

/**
 * Infer product from public path for shared paywall CTAs.
 * No query parsing (may contain PII).
 */
export function inferProductFunnelFromPath(pathname: string): ProductFunnelProduct | null {
  const p = pathname.split("?")[0] || "";
  if (p.startsWith("/natalnaya-karta") || p.startsWith("/cabinet/astrology")) return "natal";
  if (p.startsWith("/dizayn-cheloveka") || p.startsWith("/cabinet/human-design")) {
    return "human_design";
  }
  if (p.includes("matrica-sovmestimosti")) return "matrix_compatibility";
  if (p.startsWith("/aura")) return "aura";
  if (
    p.startsWith("/gadanie-po-ladoni") ||
    p.startsWith("/khiromantiya") ||
    p.startsWith("/chiromantiya") ||
    p.startsWith("/ladon") ||
    p.startsWith("/gadanie-po-ruke")
  ) {
    return "palm";
  }
  if (p.includes("destiny-matrix") || p === "/matrix-destiny") return "matrix";
  if (
    p === "/" ||
    p.startsWith("/rasklad") ||
    p.startsWith("/taro") ||
    p.startsWith("/lenormand") ||
    p.startsWith("/gadanie") ||
    p.startsWith("/goroskop") ||
    p.startsWith("/runy")
  ) {
    return "tarot";
  }
  return null;
}

/**
 * Legacy Metrika goals kept for compatibility; unified stages are dual-emitted
 * at call sites (do not remove these goals).
 */
export const PRODUCT_FUNNEL_LEGACY_GOALS: Record<
  ProductFunnelProduct,
  Partial<Record<ProductFunnelStage, readonly string[]>>
> = {
  tarot: {
    product_view: ["landing_view"],
    free_start: ["guest_spread_started"],
    free_complete: ["guest_spread_completed"],
    auth_cta: ["guest_teaser_cta"],
    claim_complete: ["guest_claim", "guest_triplet_resume_started"],
    paid_cta: ["paywall_open"],
  },
  matrix: {
    product_view: ["matrix_landing_view"],
    free_complete: ["matrix_preview_complete"],
    claim_complete: ["matrix_guest_claim_complete"],
    paid_cta: ["matrix_cta_full"],
  },
  natal: {
    product_view: ["natal_landing_view"],
    free_start: ["natal_guest_calc_start"],
    free_complete: ["natal_guest_calc_complete"],
    auth_cta: ["natal_guest_full_cta"],
    claim_complete: ["natal_guest_claim_complete"],
    paid_cta: ["natal_guest_full_cta"],
  },
  human_design: {
    product_view: ["hd_calc_view"],
    free_start: ["hd_calc_start"],
    paid_cta: ["paywall_open"],
  },
  matrix_compatibility: {
    product_view: ["matrix_pair_landing_view"],
    free_start: ["matrix_pair_guest_calc_start"],
    free_complete: ["matrix_pair_guest_calc_complete"],
    claim_complete: ["matrix_pair_guest_claim_complete"],
    paid_cta: ["matrix_pair_cta_full"],
  },
  aura: {
    product_view: ["aura_landing_view"],
    free_start: ["aura_snapshot_start"],
    free_complete: ["aura_snapshot_complete"],
    auth_cta: ["aura_auth_cta"],
    claim_complete: ["aura_guest_claim_complete"],
    paid_cta: ["aura_paid_cta"],
  },
  palm: {
    product_view: ["palm_landing_view"],
    free_start: ["palm_snapshot_start"],
    free_complete: ["palm_snapshot_complete"],
    auth_cta: ["palm_auth_cta"],
    claim_complete: ["palm_guest_claim_complete"],
    paid_cta: ["palm_paid_cta"],
  },
};

export const RETENTION_OPTIN_EVENTS = [
  "retention_optin_shown",
  "retention_optin_accepted",
  "retention_optin_declined",
  "retention_optin_settings_opened",
] as const;

export type RetentionOptInEvent = (typeof RETENTION_OPTIN_EVENTS)[number];

const RETENTION_OPTIN_SURFACES = new Set([
  "post_value",
  "authenticated_home",
  "cabinet",
]);

const RETENTION_OPTIN_TOPICS = new Set([
  "personal_reminders",
  "daily_cards",
  "weekly_digest",
]);

/** Retention opt-in. Payload allowlist: surface + topic. */
export function trackRetentionOptIn(
  event: RetentionOptInEvent,
  params: { surface: string; topic?: string }
): void {
  if (!(RETENTION_OPTIN_EVENTS as readonly string[]).includes(event)) return;
  if (!RETENTION_OPTIN_SURFACES.has(params.surface)) return;
  const payload: Record<string, string> = { surface: params.surface };
  if (params.topic && RETENTION_OPTIN_TOPICS.has(params.topic)) {
    payload.topic = params.topic;
  }
  reachGoal(event, payload);
}
