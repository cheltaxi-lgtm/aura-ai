/**
 * Client-safe peek of GET /api/daily-reading.
 * Header CTA prefers today's paid 7-card extended reading over the free 3-card daily.
 */

export type DailyReadingPeek = {
  drawn?: boolean;
  text?: string | null;
  spreadId?: string | null;
  cards?: unknown[] | null;
};

export function isDrawnExtendedDailyReading(data: DailyReadingPeek | null | undefined): boolean {
  if (!data?.drawn || !data.text?.trim()) return false;
  if (data.spreadId === "daily-extended") return true;
  return Array.isArray(data.cards) && data.cards.length >= 7;
}
