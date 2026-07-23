/**
 * Mark legacy stub/fallback history rows so they cannot be reused as AI cache.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/quarantine-legacy-fallback-readings.ts --all
 *   node --env-file=.env.local --import tsx scripts/quarantine-legacy-fallback-readings.ts <userId>
 *   ... --dry-run
 */
import { query, ensureDb } from "@/lib/db";
import { isDailyReadingPlaceholder } from "@/lib/daily-energy";

const FALLBACK_MARKERS = [
  "этот символ показывает",
  "Опирайтесь на образ",
  "пройди каждую позицию и сведи их в единый совет",
  "твой прогноз «расширенный день». В утро —",
  "твой прогноз «энергия дня». В утро —",
] as const;

const args = process.argv.slice(2);
const ALL_USERS = args.includes("--all");
const DRY_RUN = args.includes("--dry-run");
const USER_ID = args.find((a) => !a.startsWith("--"))?.trim();

function isFallbackText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return FALLBACK_MARKERS.some((m) => t.includes(m));
}

async function main(): Promise<void> {
  if (!(await ensureDb())) throw new Error("DB unavailable");
  if (!ALL_USERS && !USER_ID) {
    throw new Error("Pass --all or a userId");
  }

  const params: unknown[] = [];
  let userFilter = "";
  if (USER_ID) {
    params.push(USER_ID);
    userFilter = `AND user_id = $1`;
  }

  const { rows } = await query<{
    id: string;
    user_id: string;
    context_data: Record<string, unknown>;
  }>(
    `SELECT id, user_id, context_data
     FROM history
     WHERE context_data->>'type' IN ('reading', 'intention_spread', 'daily_reading')
       ${userFilter}
       AND (
         context_data->>'source' IS DISTINCT FROM 'ai'
         OR context_data->'provenance'->>'contentHash' IS NULL
         OR context_data->'provenance'->>'model' IS NULL
       )
     ORDER BY created_at DESC
     LIMIT 5000`,
    params
  );

  let quarantined = 0;
  for (const row of rows) {
    const reading =
      typeof row.context_data.reading === "string" ? row.context_data.reading : "";
    const cards = Array.isArray(row.context_data.tarotCards)
      ? (row.context_data.tarotCards as { name?: string }[])
      : [];
    const looksFallback =
      isFallbackText(reading) ||
      (row.context_data.type === "daily_reading" &&
        isDailyReadingPlaceholder(
          reading,
          cards.map((c) => ({
            name: String(c.name ?? ""),
            meaning: "",
            reversed: false,
            position: "",
          }))
        ));

    // Quarantine missing provenance OR explicit fallback markers.
    if (!looksFallback && row.context_data.source === "ai") {
      // Incomplete stub provenance from early rollout — still not cache-reusable.
    }

    console.log(
      `${DRY_RUN ? "[dry-run] " : ""}quarantine ${row.id.slice(0, 8)} user=${row.user_id.slice(0, 8)} type=${String(row.context_data.type)} fallback=${looksFallback}`
    );

    if (!DRY_RUN) {
      await query(
        `UPDATE history
         SET context_data =
           jsonb_set(
             jsonb_set(context_data, '{source}', '"legacy_fallback"', true),
             '{provenance}',
             jsonb_build_object(
               'source', 'legacy_fallback',
               'quarantinedAt', to_jsonb(NOW()::text),
               'reason', to_jsonb($2::text)
             ),
             true
           )
         WHERE id = $1`,
        [row.id, looksFallback ? "fallback_markers" : "missing_ai_provenance"]
      );
    }
    quarantined += 1;
  }

  console.log(
    `\nDone: ${quarantined} row(s) ${DRY_RUN ? "would be " : ""}quarantined.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
