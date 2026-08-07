#!/usr/bin/env node
/**
 * Post-migration production gate for the natal flagship schema.
 * Prints identifiers only; DATABASE_URL and other secrets are never logged.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_MIGRATIONS = [
  "064_migrate_natal_report_history.sql",
  "065_migrate_natal_timing.sql",
  "066_migrate_natal_ai_preferences.sql",
  "067_migrate_private_report_shares.sql",
  "068_harden_natal_backend.sql",
  "069_migrate_natal_compatibility.sql",
  "070_migrate_natal_async_jobs.sql",
  "073_migrate_async_job_billing_and_reaper.sql",
  "077_migrate_premium_ai_delivery.sql",
];
const REQUIRED_TABLES = [
  "natal_report_history",
  "natal_timing_cache",
  "natal_event_preferences",
  "natal_event_delivery_log",
  "natal_ai_preferences",
  "private_report_shares",
  "natal_compatibility_reports",
  "async_jobs",
];
const REQUIRED_COLUMNS = {
  rune_transactions: ["refund_of_transaction_id"],
  async_jobs: [
    "locked_at",
    "worker_id",
    "attempt_count",
    "period_metadata",
    "error_code",
    "billing_state",
    "charge_transaction_id",
    "dedupe_key",
    "action_type",
    "output_entity_id",
    "output_entity_table",
    "provenance",
    "next_attempt_at",
  ],
  natal_report_history: [
    "birth_fingerprint",
    "engine_version",
    "ephemeris",
    "tradition",
    "report_type",
    "structured_data",
    "evidence_refs",
    "rune_cost",
    "charge_transaction_id",
    "claim_token",
  ],
  natal_timing_cache: [
    "horizon_days",
    "window_start",
    "window_end",
    "engine_version",
    "birth_fingerprint",
    "timing_data",
    "generated_at",
    "claim_token",
    "claim_at",
  ],
  natal_event_preferences: [
    "enabled",
    "horizons",
    "categories",
    "planet_importance",
    "frequency",
    "in_app",
    "push",
    "timezone",
    "last_notified_at",
  ],
  natal_ai_preferences: ["ai_context_enabled", "tarot_context_enabled"],
  private_report_shares: [
    "owner_user_id",
    "token",
    "report_kind",
    "report_id",
    "selected_sections",
    "public_payload",
    "expires_at",
    "revoked_at",
  ],
  joint_readings: [
    "combined_claim_token",
    "combined_claim_at",
    "completion_notified_at",
  ],
  natal_compatibility_reports: [
    "owner_user_id",
    "participant_user_id",
    "canonical_report_id",
    "mode",
    "status",
    "owner_label",
    "partner_label",
    "owner_fingerprint",
    "partner_fingerprint",
    "pair_fingerprint",
    "invite_token_hash",
    "synastry_snapshot",
    "report_data",
    "evidence_refs",
    "rune_cost",
    "charge_transaction_id",
    "generation_claim_token",
    "generation_claim_at",
    "claimed_at",
    "expires_at",
    "completed_at",
  ],
};
const REQUIRED_INDEXES = [
  "idx_rune_transactions_refund_once",
  "idx_natal_report_history_charge",
  "idx_natal_report_history_user_created",
  "idx_natal_timing_cache_user_generated",
  "idx_natal_event_preferences_due",
  "idx_natal_event_delivery_log_delivered",
  "idx_private_report_shares_owner",
  "idx_private_report_shares_active_token",
  "idx_natal_compatibility_owner_created",
  "idx_natal_compatibility_participant_created",
  "idx_natal_compatibility_expiry",
  "idx_natal_compatibility_owner_pair",
];
const REQUIRED_CONSTRAINTS = [
  "natal_report_history_version_unique",
  "natal_timing_cache_window_unique",
  "natal_event_preferences_horizons",
  "natal_event_preferences_categories",
  "natal_compatibility_mode_token",
  "natal_compatibility_ready_data",
  "natal_compatibility_completed_data",
  "natal_compatibility_snapshot_private",
];
const REQUIRED_FUNCTIONS = ["validate_private_report_share_target"];
const REQUIRED_TRIGGERS = ["trg_validate_private_report_share_target"];

function loadEnvFile(name) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const migrationResult = await client.query(
      `SELECT version
       FROM schema_migrations
       WHERE version = ANY($1::text[])`,
      [REQUIRED_MIGRATIONS]
    );
    const recorded = new Set(migrationResult.rows.map((row) => row.version));
    const missingMigrations = REQUIRED_MIGRATIONS.filter((name) => !recorded.has(name));

    const tableResult = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [REQUIRED_TABLES]
    );
    const existing = new Set(tableResult.rows.map((row) => row.table_name));
    const missingTables = REQUIRED_TABLES.filter((name) => !existing.has(name));

    const requiredColumnPairs = Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) =>
      columns.map((column) => `${table}.${column}`)
    );
    const columnResult = await client.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [Object.keys(REQUIRED_COLUMNS)]
    );
    const existingColumns = new Set(
      columnResult.rows.map((row) => `${row.table_name}.${row.column_name}`)
    );
    const missingColumns = requiredColumnPairs.filter((name) => !existingColumns.has(name));

    const indexResult = await client.query(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname = ANY($1::text[])`,
      [REQUIRED_INDEXES]
    );
    const existingIndexes = new Set(indexResult.rows.map((row) => row.indexname));
    const missingIndexes = REQUIRED_INDEXES.filter((name) => !existingIndexes.has(name));

    const constraintResult = await client.query(
      `SELECT conname
       FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace
         AND conname = ANY($1::text[])`,
      [REQUIRED_CONSTRAINTS]
    );
    const existingConstraints = new Set(constraintResult.rows.map((row) => row.conname));
    const missingConstraints = REQUIRED_CONSTRAINTS.filter(
      (name) => !existingConstraints.has(name)
    );

    const functionResult = await client.query(
      `SELECT proname
       FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace
         AND proname = ANY($1::text[])`,
      [REQUIRED_FUNCTIONS]
    );
    const existingFunctions = new Set(functionResult.rows.map((row) => row.proname));
    const missingFunctions = REQUIRED_FUNCTIONS.filter((name) => !existingFunctions.has(name));

    const triggerResult = await client.query(
      `SELECT tgname
       FROM pg_trigger
       WHERE NOT tgisinternal
         AND tgname = ANY($1::text[])`,
      [REQUIRED_TRIGGERS]
    );
    const existingTriggers = new Set(triggerResult.rows.map((row) => row.tgname));
    const missingTriggers = REQUIRED_TRIGGERS.filter((name) => !existingTriggers.has(name));

    const pricingResult = await client.query(
      `SELECT
         value #>> '{costs,NATAL_READING}' AS natal_reading,
         value #>> '{costs,FORECAST_REPORT}' AS forecast_report,
         value #>> '{costs,SYNASTRY_REPORT}' AS synastry_report
       FROM platform_settings
       WHERE key = 'runes'`
    );
    const pricing = pricingResult.rows[0];
    // Migration 111: natal ~1500 ₽ at rubPerRune=5 → 300 ᚢ. Forecast/synastry unchanged.
    const pricingValid =
      pricing?.natal_reading === "300" &&
      pricing?.forecast_report === "20" &&
      pricing?.synastry_report === "30";

    if (
      missingMigrations.length ||
      missingTables.length ||
      missingColumns.length ||
      missingIndexes.length ||
      missingConstraints.length ||
      missingFunctions.length ||
      missingTriggers.length ||
      !pricingValid
    ) {
      if (missingMigrations.length) {
        console.error(`[natal-schema] missing migration records: ${missingMigrations.join(", ")}`);
      }
      if (missingTables.length) {
        console.error(`[natal-schema] missing tables: ${missingTables.join(", ")}`);
      }
      if (missingColumns.length) {
        console.error(`[natal-schema] missing columns: ${missingColumns.join(", ")}`);
      }
      if (missingIndexes.length) {
        console.error(`[natal-schema] missing indexes: ${missingIndexes.join(", ")}`);
      }
      if (missingConstraints.length) {
        console.error(`[natal-schema] missing constraints: ${missingConstraints.join(", ")}`);
      }
      if (missingFunctions.length) {
        console.error(`[natal-schema] missing functions: ${missingFunctions.join(", ")}`);
      }
      if (missingTriggers.length) {
        console.error(`[natal-schema] missing triggers: ${missingTriggers.join(", ")}`);
      }
      if (!pricingValid) {
        console.error(
          `[natal-schema] rune pricing mismatch: natal=300, forecast=20, synastry=30 required (got natal=${pricing?.natal_reading}, forecast=${pricing?.forecast_report}, synastry=${pricing?.synastry_report})`
        );
      }
      process.exitCode = 1;
      return;
    }
    console.log(
      `[natal-schema] OK: ${REQUIRED_MIGRATIONS.length} migrations and all natal schema objects verified`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[natal-schema] FAILED: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
