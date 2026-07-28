/**
 * Search-query classifier — 9 rules from Ads Autopilot plan.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getCompetitorBrandTerms, normalizeForMatch } from "../validator";

export type SearchQueryInput = {
  query: string;
  clicks?: number;
  deckViews?: number;
  spreadSubmits?: number;
  registrations?: number;
  firstPayments?: number;
  /** Phrase already in keyword core */
  inCore?: boolean;
  /** Whitelisted landing exists for this query intent */
  landingExists?: boolean;
};

export type SearchQueryDecision =
  | "negative"
  | "add_keyword"
  | "high_value"
  | "new_landing_approval"
  | "keep";

export type SearchQueryResult = {
  decision: SearchQueryDecision;
  rule: number | null;
  reason: string;
  phrase: string;
};

type NegativesYaml = {
  always_18plus?: string[];
  patterns?: string[];
};

function loadNegatives(): NegativesYaml {
  try {
    const path = join(process.cwd(), "config/ads/negatives.yaml");
    if (!existsSync(path)) return {};
    const yaml = require("yaml") as { parse: (s: string) => NegativesYaml };
    return yaml.parse(readFileSync(path, "utf8")) || {};
  } catch {
    return {};
  }
}

const DEFAULT_18PLUS = [
  "дети",
  "ребенок",
  "ребёнок",
  "ребенку",
  "ребёнку",
  "школьник",
  "подросток",
  "для детей",
  "детский",
];

/** Classify a single search query. Rules run in priority order 1→9. */
export function classifySearchQuery(input: SearchQueryInput): SearchQueryResult {
  const phrase = input.query.trim();
  const n = normalizeForMatch(phrase);
  const neg = loadNegatives();
  const eighteen = (neg.always_18plus?.length ? neg.always_18plus : DEFAULT_18PLUS).map(
    (x) => normalizeForMatch(x)
  );

  // 1) 18+ stop patterns
  if (eighteen.some((w) => w && n.includes(w))) {
    return { decision: "negative", rule: 1, reason: "18plus", phrase };
  }

  // 2) regex from negatives.yaml
  for (const pat of neg.patterns || []) {
    try {
      if (new RegExp(pat).test(phrase) || new RegExp(pat).test(n)) {
        return { decision: "negative", rule: 2, reason: `negatives:${pat}`, phrase };
      }
    } catch {
      /* invalid pattern — skip */
    }
  }

  // 3) competitor brand_terms
  const brands = getCompetitorBrandTerms();
  const brandHit = brands.find((b) => n.includes(normalizeForMatch(b)));
  if (brandHit) {
    return { decision: "negative", rule: 3, reason: `brand:${brandHit}`, phrase };
  }

  const clicks = input.clicks ?? 0;
  const decks = input.deckViews ?? 0;
  const spreads = input.spreadSubmits ?? 0;
  const regs = input.registrations ?? 0;
  const pays = input.firstPayments ?? 0;

  // 4) clicks ≥ 15 and 0 deck_view
  if (clicks >= 15 && decks === 0) {
    return { decision: "negative", rule: 4, reason: "clicks_no_deck", phrase };
  }

  // 5) clicks ≥ 25 and 0 spread_submit
  if (clicks >= 25 && spreads === 0) {
    return { decision: "negative", rule: 5, reason: "clicks_no_spread", phrase };
  }

  // 6) clicks ≥ 30 and 0 registration
  if (clicks >= 30 && regs === 0) {
    return { decision: "negative", rule: 6, reason: "clicks_no_reg", phrase };
  }

  // 7) registration, not in core, landing exists → add keyword
  if (regs > 0 && !input.inCore && input.landingExists) {
    return { decision: "add_keyword", rule: 7, reason: "reg_add_keyword", phrase };
  }

  // 8) first_payment → high_value
  if (pays > 0) {
    return { decision: "high_value", rule: 8, reason: "first_payment", phrase };
  }

  // 9) registration but no landing → approval new_landing
  if (regs > 0 && input.landingExists === false) {
    return {
      decision: "new_landing_approval",
      rule: 9,
      reason: "reg_no_landing",
      phrase,
    };
  }

  return { decision: "keep", rule: null, reason: "no_match", phrase };
}
