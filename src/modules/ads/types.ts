export type MicroConversionType =
  | "deck_view"
  | "card_pick"
  | "spread_submit"
  | "teaser_view";

export type ServerConversionType =
  | "registration"
  | "claim"
  | "first_rune_spend"
  | "first_payment"
  | "repeat_payment";

export type ConversionType = MicroConversionType | ServerConversionType;

export type ApprovalKind =
  | "budget_increase"
  | "bid_increase"
  | "global_cap_increase"
  | "new_landing"
  | "new_cluster"
  | "mode_switch"
  | "optimization_goal_switch"
  | "seo_safe_fix"
  | "seo_content_change"
  | "seo_route_change";

export const OPTIMIZATION_GOALS_ALLOWED = ["registration", "first_payment"] as const;
export const OPTIMIZATION_GOALS_FORBIDDEN = ["deck_view", "spread_submit"] as const;
