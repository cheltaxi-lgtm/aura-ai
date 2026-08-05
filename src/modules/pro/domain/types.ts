/** Core Pro domain types (S0 stubs — expand in S1+). */

export type ProAccountStatus = "pending" | "active" | "suspended" | "closed";
export type ProTier = "free_trial" | "pro";

export type ProCaseType =
  | "manual_spread"
  | "photo_spread"
  | "custom_layout"
  | "natal"
  | "forecast"
  | "synastry"
  | "matrix"
  | "numerology"
  | "runes"
  | "lenormand";

/** MVP case types (phase 1). */
export const PRO_MVP_CASE_TYPES: readonly ProCaseType[] = [
  "manual_spread",
  "natal",
  "matrix",
] as const;

export type ProCaseStatus =
  | "new"
  | "input_ready"
  | "generating"
  | "draft"
  | "edited"
  | "delivered"
  | "archived"
  | "failed";

export type ProCaseVersionSource = "ai" | "human";

export type ProReportBlock = {
  id: string;
  title: string;
  body: string;
  position_ref?: string | null;
  locked?: boolean;
  ai_confidence?: number | null;
};
