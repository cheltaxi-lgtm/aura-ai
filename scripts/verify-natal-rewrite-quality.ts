/**
 * Post-rewrite check: near-dupe sections + thin timing trio.
 *   node --env-file=.env.local --import tsx scripts/verify-natal-rewrite-quality.ts
 */
import { ensureDb, query } from "@/lib/db";
import { findNearDuplicateSections } from "@/lib/natal/report-quality";
import type { NatalReport } from "@/lib/natal/report";

async function main() {
  if (!(await ensureDb())) {
    console.error("DB unavailable");
    process.exit(1);
  }
  const { rows } = await query<{
    id: string;
    report_type: string;
    structured_data: NatalReport | null;
    updated_at: Date | string;
  }>(
    `SELECT id, report_type, structured_data, updated_at
     FROM natal_report_history
     ORDER BY updated_at DESC`
  );

  let ok = 0;
  let bad = 0;
  for (const row of rows) {
    const report = row.structured_data;
    if (!report?.sections?.length) {
      bad += 1;
      console.log(`[bad] ${row.id.slice(0, 8)} ${row.report_type} no_sections`);
      continue;
    }
    const dupes = findNearDuplicateSections(report, 0.62);
    const timingKeys = ["summary", "currentPeriod", "recommendations"] as const;
    const texts = Object.fromEntries(
      timingKeys.map((key) => {
        const section = report.sections.find((s) => s.key === key);
        const text = section?.claims?.map((c) => c.text).join(" ") ?? "";
        return [key, text];
      })
    );
    const thin = timingKeys.filter((key) => (texts[key]?.length ?? 0) < 120);
    if (dupes.length || thin.length) {
      bad += 1;
      console.log(
        `[bad] ${row.id.slice(0, 8)} ${row.report_type} dupes=${JSON.stringify(dupes)} thin=${thin.join(",")}`
      );
    } else {
      ok += 1;
    }
  }
  console.log(`verify ok=${ok} bad=${bad} total=${rows.length}`);
  if (bad > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
