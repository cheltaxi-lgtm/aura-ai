export type SpreadMetricEvent = "spread_selected" | "spread_completed";

export type SpreadMetricPayload = {
  spreadId: string;
  intention?: string | null;
  characterId?: string;
  cardCount?: number;
  cost?: number;
  source?: string;
};

/** Structured spread catalog metrics (console + optional analytics hook). */
export function logSpreadMetric(event: SpreadMetricEvent, payload: SpreadMetricPayload): void {
  const line = `[metrics] ${event} ${JSON.stringify(payload)}`;
  console.info(line);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(`zovus:${event}`, { detail: payload }));
  }
}
