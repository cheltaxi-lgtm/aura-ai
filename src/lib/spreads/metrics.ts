export type SpreadMetricEvent = "spread_selected" | "spread_completed";

export type SpreadMetricPayload = {
  spreadId: string;
  intention?: string | null;
  characterId?: string;
  cardCount?: number;
  cost?: number;
  source?: string;
};

function emitSpreadMetric(event: SpreadMetricEvent, payload: SpreadMetricPayload): void {
  const line = `[metrics] ${event} ${JSON.stringify(payload)}`;
  console.info(line);
}

/** Structured spread catalog metrics (console, CustomEvent, server ingest). */
export function logSpreadMetric(event: SpreadMetricEvent, payload: SpreadMetricPayload): void {
  emitSpreadMetric(event, payload);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(`zovus:${event}`, { detail: payload }));
    void fetch("/api/metrics/spread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...payload }),
      keepalive: true,
    }).catch(() => {
      /* non-blocking */
    });
  }
}
