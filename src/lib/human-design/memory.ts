import type { HdChart } from "./types";
import { formatHdFactLine } from "./prompt";

/**
 * Persist the chart digest as a durable cross-master memory fact.
 * Fire-and-forget: memory must never break chart/report flows.
 */
export function rememberHdChartFact(userId: string, chart: HdChart, chartId: string): void {
  void (async () => {
    const { canAutoCapture } = await import("@/lib/memory/preferences");
    if (!(await canAutoCapture(userId))) return;
    const { upsertFact } = await import("@/lib/memory/user-facts");
    await upsertFact(userId, {
      fact: formatHdFactLine(chart),
      category: "astro",
      salience: 3,
      sourceCharacter: "system",
      sourceType: "human_design",
      sourceEntityId: chartId,
      predicateKey: "human_design.chart",
      operation: "replace",
      allowSensitive: false,
    });
  })().catch((error) => console.warn("[human-design] memory fact failed:", error));
}
