import { tarotCardsKey } from "@/lib/tarot";

/** Exact daily card identity — never reconstruct with reversed:false by default. */
export type DailyTripletCard = {
  id: number;
  name: string;
  position: number;
  reversed: boolean;
};

export function normalizeDailyTripletCards(raw: unknown): DailyTripletCard[] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const cards: DailyTripletCard[] = [];
  for (let i = 0; i < 3; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) return null;
    const id =
      typeof obj.id === "number" && Number.isFinite(obj.id)
        ? Math.trunc(obj.id)
        : typeof obj.id === "string" && /^\d+$/.test(obj.id.trim())
          ? Number(obj.id.trim())
          : i;
    const position =
      typeof obj.position === "number" && Number.isFinite(obj.position)
        ? Math.trunc(obj.position)
        : i;
    const reversed = Boolean(obj.reversed);
    cards.push({ id, name, position, reversed });
  }
  cards.sort((a, b) => a.position - b.position);
  return cards;
}

export function dailyCardsKey(cards: DailyTripletCard[]): string {
  return tarotCardsKey(cards.map((c) => ({ name: c.name })));
}

export function parseSessionDailyCardNames(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((c) => {
        if (typeof c === "string" && c.trim()) return c.trim();
        if (c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string") {
          return String((c as { name: string }).name).trim();
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.symbols)) return parseSessionDailyCardNames(obj.symbols);
    if (Array.isArray(obj.tarotCards)) return parseSessionDailyCardNames(obj.tarotCards);
  }
  return [];
}

export function isDailyHistoryMarker(context: Record<string, unknown> | null | undefined): boolean {
  if (!context) return false;
  const type = typeof context.type === "string" ? context.type : "";
  const spreadType = typeof context.spreadType === "string" ? context.spreadType : "";
  if (type === "guest_resume" || type === "guest_intro") return false;
  if (spreadType === "guest_resume" || spreadType === "guest_intro") return false;
  if (type === "daily_triplet" || spreadType === "daily") return true;
  // Legacy authenticated daily rows from /api/onboarding.
  if (type === "triplet") return true;
  return false;
}
