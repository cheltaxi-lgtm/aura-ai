import type { HdChart } from "./types";
import { formatHdFactLine } from "./prompt";
import { query } from "@/lib/db";

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

/**
 * Remove the durable fact tied to a deleted chart. Fire-and-forget —
 * chart deletion must succeed even if memory cleanup fails.
 */
export function forgetHdChartFact(userId: string, chartId: string): void {
  void (async () => {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM user_facts
        WHERE user_id = $1 AND source_type = 'human_design' AND source_entity_id = $2`,
      [userId, chartId]
    );
    if (!rows[0]) return;
    const { deleteFact } = await import("@/lib/memory/user-facts");
    await deleteFact(userId, rows[0].id);
  })().catch((error) => console.warn("[human-design] memory forget failed:", error));
}
