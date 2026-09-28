/** One-time release repair for accounts whose starter gift waited for email proof.
 * Dry-run by default; prints aggregates only. Safe to repeat after --apply. */
import { loadEnvConfig } from "@next/env";
import { getPool, query } from "../src/lib/db";
import { getRuneSettings } from "../src/lib/rune-settings";
import { grantStarterRunesIfNeeded } from "../src/lib/rune-service";

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const expectedArg = args.find((arg) => arg.startsWith("--expect="));
const expectedStarterArg = args.find((arg) => arg.startsWith("--expect-starter="));
const expectedOldArg = args.find((arg) => arg.startsWith("--expect-old="));
const expected = expectedArg ? Number(expectedArg.slice("--expect=".length)) : null;
const expectedStarter = expectedStarterArg ? Number(expectedStarterArg.slice("--expect-starter=".length)) : null;
const expectedOld = expectedOldArg ? Number(expectedOldArg.slice("--expect-old=".length)) : null;
if (args.some((arg) => arg !== "--apply" && arg !== expectedArg && arg !== expectedStarterArg && arg !== expectedOldArg) ||
    (apply && (!Number.isSafeInteger(expected) || expected === null || expected < 0 ||
      !Number.isSafeInteger(expectedStarter) || expectedStarter === null || expectedStarter <= 0 ||
      !Number.isSafeInteger(expectedOld) || expectedOld === null || expectedOld < 0))) {
  throw new Error("Usage: tsx scripts/backfill-pending-starter.ts [--apply --expect=<dry-run-count> --expect-starter=<dry-run-starter-runes> --expect-old=<dry-run-old-promise-count>]");
}

async function main() {
  const settings = await getRuneSettings();
  if (!settings.enabled && apply) throw new Error("runes_disabled");
  if (apply && settings.starterRunes !== expectedStarter) throw new Error(`starter_amount_changed: expected=${expectedStarter} actual=${settings.starterRunes}`);
  const { rows } = await query<{ id: string; starter_bonus_version: string | null }>(`
    SELECT u.id, u.starter_bonus_version FROM users u
    JOIN user_accounts ua ON ua.profile_user_id = u.id
    WHERE ua.bonus_email_verification_required = TRUE
      AND u.starter_runes_granted = FALSE
      AND (u.starter_bonus_version = 'starter-100-v1'
        OR (u.starter_bonus_version IS NULL AND ua.created_at >= DATE '2026-09-25'))
      AND ua.erasure_requested_at IS NULL
      AND u.erasure_requested_at IS NULL
    GROUP BY u.id, u.created_at, u.starter_bonus_version
    ORDER BY u.created_at, u.id`);
  const oldPromiseCount = rows.filter((row) => row.starter_bonus_version === "starter-100-v1").length;
  console.log(JSON.stringify({ eligible: rows.length, currentPromiseCount: rows.length - oldPromiseCount, oldPromiseCount, starterRunes: settings.starterRunes, apply }));
  if (!apply) return;
  if (rows.length !== expected) throw new Error(`eligible_count_changed: expected=${expected} actual=${rows.length}`);
  if (oldPromiseCount !== expectedOld) throw new Error(`old_promise_count_changed: expected=${expectedOld} actual=${oldPromiseCount}`);
  let credited = 0;
  let alreadyCredited = 0;
  let totalRunes = 0;
  for (const row of rows) {
    const result = await grantStarterRunesIfNeeded(row.id);
    if (result) { credited++; totalRunes += result.granted; }
    else alreadyCredited++;
  }
  console.log(JSON.stringify({ credited, alreadyCredited, totalRunes }));
}

main().catch((error) => {
  console.error("starter backfill failed:", error instanceof Error ? error.message : "unknown");
  process.exitCode = 1;
}).finally(async () => { await getPool().end(); });
