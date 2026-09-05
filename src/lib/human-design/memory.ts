import type { HdChart } from "./types";
import { formatHdFactLine } from "./prompt";
import { query } from "@/lib/db";

/**
 * Persist the chart digest as a durable cross-master memory fact.
 * Awaited persistence: failures do not break chart/report flows.
 */
export async function rememberHdChartFact(userId: string, chart: HdChart, chartId: string, captureGeneration: string | null): Promise<void> {
  if (captureGeneration == null) return;
  await (async () => {
    const { canAutoCapture } = await import("@/lib/memory/preferences");
    if (!(await canAutoCapture(userId))) return;
    const { upsertFact } = await import("@/lib/memory/user-facts");
    await upsertFact(userId, {
      captureGeneration,
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
 * Remove every durable fact tied to a deleted/demoted chart.
 */
export async function forgetHdChartFact(userId: string, chartId: string): Promise<void> {
  await (async () => {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM user_facts
        WHERE user_id = $1 AND source_type = 'human_design' AND source_entity_id = $2`,
      [userId, chartId]
    );
    if (!rows.length) return;
    const { deleteFact } = await import("@/lib/memory/user-facts");
    for (const row of rows) await deleteFact(userId, row.id);
  })().catch((error) => console.warn("[human-design] memory forget failed:", error));
}
