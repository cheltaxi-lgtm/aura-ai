import { recordJourneyEvent } from "@/lib/spread-metrics-store";

/** Operational stages use fixed codes; never store provider errors or personal data. */
export async function recordRuneCheckoutEvent(userId: string, event: "payment_attempted" | "payment_failed" | "payment_started", key: string, data: { errorCode?: string; amountRub?: number; runes?: number } = {}): Promise<void> {
  try { await recordJourneyEvent(userId, event, key, data); }
  catch { console.error("Rune checkout telemetry unavailable"); }
}
