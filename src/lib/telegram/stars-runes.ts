/**
 * Telegram Stars pricing for rune packages sold inside the bot.
 * Site YooKassa keeps price_rub; Stars is a parallel channel (digital goods = XTR only).
 *
 * Conversion: ~2 ₽ / Star, rounded to friendly integers. Override via TELEGRAM_STARS_RUB_PER_STAR.
 */

export type StarsRunePackage = {
  id: string;
  name: string;
  runes: number;
  bonusRunes: number;
  totalRunes: number;
  priceRub: number;
  stars: number;
  isPopular: boolean;
};

/** Rub per one Star for package pricing (not the user App Store rate). */
export function starsRubPerStar(): number {
  const raw = Number(process.env.TELEGRAM_STARS_RUB_PER_STAR?.trim());
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 2;
}

export function starsFromPriceRub(priceRub: number): number {
  const rub = Math.max(0, Math.round(Number(priceRub) || 0));
  if (rub <= 0) return 1;
  return Math.max(1, Math.round(rub / starsRubPerStar()));
}

/** Invoice payload: runes:<packageId>:<telegramUserId>:<issuedAtSec> */
export function buildStarsInvoicePayload(
  packageId: string,
  telegramUserId: number,
  issuedAtSec: number = Math.floor(Date.now() / 1000)
): string {
  const pkg = packageId.replace(/[^a-z0-9_-]/gi, "").slice(0, 32);
  return `runes:${pkg}:${telegramUserId}:${issuedAtSec}`;
}

export function parseStarsInvoicePayload(payload: string): {
  packageId: string;
  telegramUserId: number;
  issuedAtSec: number;
} | null {
  const m = /^runes:([a-z0-9_-]+):(\d+):(\d+)$/i.exec((payload || "").trim());
  if (!m) return null;
  const packageId = m[1]!;
  const telegramUserId = Number(m[2]);
  const issuedAtSec = Number(m[3]);
  if (!packageId || !Number.isFinite(telegramUserId) || telegramUserId <= 0) return null;
  if (!Number.isFinite(issuedAtSec) || issuedAtSec <= 0) return null;
  return { packageId, telegramUserId, issuedAtSec };
}

/** Reject stale unpaid invoices (24h). */
export function isStarsInvoiceFresh(issuedAtSec: number, nowSec = Math.floor(Date.now() / 1000)): boolean {
  return nowSec - issuedAtSec <= 86_400 && issuedAtSec <= nowSec + 60;
}

export function starsPaymentId(telegramPaymentChargeId: string): string {
  const id = (telegramPaymentChargeId || "").trim();
  return id.startsWith("tg_stars:") ? id : `tg_stars:${id}`;
}
