import { directCall } from "./client";

/** Discovery uses auto strategies — manual bids unused. Kept for API surface. */
export async function setBids(keywordBids: { KeywordId: number; Bid: number }[]) {
  if (!keywordBids.length) return { result: {}, units: null };
  return directCall("bids", "set", { Bids: keywordBids }, { mutate: true });
}
