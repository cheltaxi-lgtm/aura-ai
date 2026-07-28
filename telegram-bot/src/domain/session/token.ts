import { createHash, randomBytes } from "node:crypto";
import type { GuestSymbol } from "../deck/types.js";
import { botConfig } from "../../config.js";

/** Format: zg_ + 32 bytes base64url. Hash: sha256 hex. */
export function createSessionToken(): string {
  return `zg_${randomBytes(32).toString("base64url")}`;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isSessionToken(value: string): boolean {
  return /^zg_[A-Za-z0-9_-]{40,}$/.test(value);
}

export function computeFingerprint(symbols: GuestSymbol[]): string {
  const ordered = [...symbols]
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.id}:${s.position}:${s.reversed ? 1 : 0}`)
    .join("|");
  const payload = [botConfig.deckId, botConfig.masterId, botConfig.spreadId, ordered].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function toGuestSymbols(
  cards: Array<{ id: number; name: string; position: number; reversed: boolean; slug?: string }>
): GuestSymbol[] {
  return cards.map((c) => ({
    id: c.id,
    name: c.name,
    position: c.position,
    reversed: c.reversed,
    deck_id: botConfig.deckId,
    spread_id: botConfig.spreadId,
    slug: c.slug,
  }));
}

export function buildFinalCtaUrl(plainToken: string): string {
  const url = new URL(botConfig.ctaTargetUrl);
  url.searchParams.set("tg_receipt", plainToken);
  url.searchParams.set("utm_source", "telegram");
  url.searchParams.set("utm_medium", "bot");
  url.searchParams.set("utm_campaign", "guest_triplet_cta");
  return url.toString();
}

/** Public redirect URL on bot HTTP service (tracked). Falls back to direct CTA if no public base. */
export function buildTrackedCtaUrl(plainToken: string): string {
  if (!botConfig.publicBaseUrl) {
    return buildFinalCtaUrl(plainToken);
  }
  return `${botConfig.publicBaseUrl}/r/${encodeURIComponent(plainToken)}`;
}
