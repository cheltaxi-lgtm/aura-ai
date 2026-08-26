/**
 * Organic Opportunity Score 0–100. Pure — no I/O.
 * Priority: positions 4–10, 11–20, 21–30, high frequency,
 * many impressions + low CTR, rising Wordstat, existing landing, commercial.
 */
export const ORGANIC_STATUSES = ["WATCH", "PUSH", "PROTECT", "EXPAND", "IGNORE"] as const;
export type OrganicStatus = (typeof ORGANIC_STATUSES)[number];

export type OpportunityInput = {
  query: string;
  position: number | null;
  impressions: number;
  clicks: number;
  ctr: number | null;
  frequency: number | null;
  wordstatRising: boolean;
  landingMatch: boolean;
  commercial: boolean;
};

const IGNORE_RE =
  /порно|xxx|torrent|скачать бесплатно взлом|казино|ставки на спорт/i;

export function isCommercialQuery(query: string): boolean {
  return /таро|рун|матриц|нумеролог|натал|гороскоп|гадан|расклад|дизайн человека|ленорман|онлайн консультац/i.test(
    query
  );
}

export function positionBandScore(position: number | null): number {
  if (position == null || !Number.isFinite(position) || position <= 0) return 0;
  if (position >= 4 && position <= 10) return 32;
  if (position > 10 && position <= 20) return 24;
  if (position > 20 && position <= 30) return 16;
  if (position >= 1 && position < 4) return 8;
  return 5;
}

export function computeOpportunityScore(input: OpportunityInput): {
  score: number;
  status: OrganicStatus;
  reasons: string[];
} {
  const q = (input.query || "").trim();
  if (!q || IGNORE_RE.test(q)) {
    return { score: 0, status: "IGNORE", reasons: ["ignored"] };
  }

  const reasons: string[] = [];
  let score = 0;
  const pos = input.position;
  const band = positionBandScore(pos);
  if (band) {
    score += band;
    reasons.push(`position_band=${pos}`);
  }

  const freq = input.frequency ?? 0;
  if (freq >= 5000) {
    score += 16;
    reasons.push("freq_very_high");
  } else if (freq >= 1000) {
    score += 12;
    reasons.push("freq_high");
  } else if (freq >= 100) {
    score += 6;
    reasons.push("freq_mid");
  }

  const shows = input.impressions || 0;
  const ctr = input.ctr;
  if (shows >= 100 && ctr != null && ctr < 0.02) {
    score += 12;
    reasons.push("high_shows_low_ctr");
  } else if (shows >= 400) {
    score += 6;
    reasons.push("high_shows");
  }

  if (input.wordstatRising) {
    score += 10;
    reasons.push("wordstat_rising");
  }
  if (input.landingMatch) {
    score += 12;
    reasons.push("landing_match");
  }
  if (input.commercial) {
    score += 8;
    reasons.push("commercial");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let status: OrganicStatus = "WATCH";
  if (pos != null && pos >= 1 && pos < 4 && (input.clicks || 0) > 0) {
    status = "PROTECT";
  } else if (score >= 55 && pos != null && pos >= 4 && pos <= 20) {
    status = "PUSH";
  } else if (pos != null && pos > 20 && pos <= 30 && score >= 40) {
    status = "EXPAND";
  } else if (score >= 55 && (pos == null || pos > 30)) {
    status = "EXPAND";
  }

  return { score, status, reasons };
}
