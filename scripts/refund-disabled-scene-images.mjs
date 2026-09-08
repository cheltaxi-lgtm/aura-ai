#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;

const ACTIONS = [
  "DESTINY_CARD",
  "SCENE_ILLUSTRATION",
  "TAROT_ATMOSPHERE",
  "FINAL_REPORT",
];
const AUDIT_CUTOFF = "2026-09-07T11:17:42.210716Z";
const EXPECTED_SPEND_COUNT = 13;
const EXPECTED_RUNE_TOTAL = 140;
const EXPECTED_BY_ACTION = Object.freeze({
  DESTINY_CARD: { spendCount: 3, runeTotal: 60 },
  SCENE_ILLUSTRATION: { spendCount: 0, runeTotal: 0 },
  TAROT_ATMOSPHERE: { spendCount: 10, runeTotal: 80 },
  FINAL_REPORT: { spendCount: 0, runeTotal: 0 },
});
const APPLY_CONFIRMATION = `${EXPECTED_SPEND_COUNT}:${EXPECTED_RUNE_TOTAL}@${AUDIT_CUTOFF}`;
const DESCRIPTION = "Возврат: отключённая AI-генерация изображения";

const args = new Set(process.argv.slice(2));
const supportedArgs = new Set(["--apply", "--help"]);
for (const arg of args) {
  if (!supportedArgs.has(arg)) {
    throw new Error(`Unknown argument: ${arg}`);
  }
}

if (args.has("--help")) {
  console.log(`Usage:
  node scripts/refund-disabled-scene-images.mjs          # dry-run (default)
  CONFIRM_SCENE_IMAGE_REFUND='${APPLY_CONFIRMATION}' node scripts/refund-disabled-scene-images.mjs --apply

The script only considers the audited image-action spends through ${AUDIT_CUTOFF}.
It prints aggregate counts only and never prints user or transaction identifiers.`);
  process.exit(0);
}

const apply = args.has("--apply");
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
if (apply && process.env.CONFIRM_SCENE_IMAGE_REFUND !== APPLY_CONFIRMATION) {
  throw new Error(
    `Apply refused. Set CONFIRM_SCENE_IMAGE_REFUND exactly to ${APPLY_CONFIRMATION}`
  );
}

const client = new Client({
  connectionString: databaseUrl,
  ssl:
    process.env.DATABASE_SSL === "require"
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined,
});

const aggregateSql = `
  SELECT s.action_type,
         COUNT(*)::int AS spend_count,
         (-SUM(s.amount))::int AS rune_total,
         COUNT(*) FILTER (WHERE r.id IS NOT NULL)::int AS refunded_count,
         COALESCE(SUM(-s.amount) FILTER (WHERE r.id IS NOT NULL), 0)::int AS refunded_runes
  FROM rune_transactions s
  LEFT JOIN rune_transactions r
    ON r.type = 'refund'
   AND r.refund_of_transaction_id = s.id
  WHERE s.type = 'spend'
    AND s.amount < 0
    AND s.action_type = ANY($1::text[])
    AND s.created_at <= $2::timestamptz
  GROUP BY s.action_type
  ORDER BY s.action_type`;

function summarize(rows) {
  const spendCount = rows.reduce((sum, row) => sum + Number(row.spend_count), 0);
  const runeTotal = rows.reduce((sum, row) => sum + Number(row.rune_total), 0);
  const refundedCount = rows.reduce((sum, row) => sum + Number(row.refunded_count), 0);
  const refundedRunes = rows.reduce((sum, row) => sum + Number(row.refunded_runes), 0);
  return {
    spendCount,
    runeTotal,
    refundedCount,
    refundedRunes,
    pendingCount: spendCount - refundedCount,
    pendingRunes: runeTotal - refundedRunes,
  };
}

function printAudit(rows, totals, mode) {
  console.log(`mode=${mode}`);
  console.log(`audit_cutoff=${AUDIT_CUTOFF}`);
  for (const row of rows) {
    console.log(
      [
        row.action_type,
        `spends=${row.spend_count}`,
        `runes=${row.rune_total}`,
        `already_refunded=${row.refunded_count}`,
        `pending_runes=${Number(row.rune_total) - Number(row.refunded_runes)}`,
      ].join(" ")
    );
  }
  console.log(
    `total spends=${totals.spendCount} runes=${totals.runeTotal} ` +
      `already_refunded=${totals.refundedCount} pending=${totals.pendingCount} ` +
      `pending_runes=${totals.pendingRunes}`
  );
}

function assertAuditedPopulation(rows, totals) {
  if (
    totals.spendCount !== EXPECTED_SPEND_COUNT ||
    totals.runeTotal !== EXPECTED_RUNE_TOTAL
  ) {
    throw new Error(
      `Safety check failed: expected ${EXPECTED_SPEND_COUNT} spends/${EXPECTED_RUNE_TOTAL} runes, ` +
        `found ${totals.spendCount}/${totals.runeTotal}. No changes were made.`
    );
  }

  const byAction = new Map(rows.map((row) => [row.action_type, row]));
  for (const action of ACTIONS) {
    const actual = byAction.get(action);
    const spendCount = Number(actual?.spend_count ?? 0);
    const runeTotal = Number(actual?.rune_total ?? 0);
    const expected = EXPECTED_BY_ACTION[action];
    if (spendCount !== expected.spendCount || runeTotal !== expected.runeTotal) {
      throw new Error(
        `Safety check failed for ${action}: expected ${expected.spendCount} spends/` +
          `${expected.runeTotal} runes, found ${spendCount}/${runeTotal}. No changes were made.`
      );
    }
  }
}

async function loadAggregate() {
  const { rows } = await client.query(aggregateSql, [ACTIONS, AUDIT_CUTOFF]);
  return { rows, totals: summarize(rows) };
}

async function applyRefunds() {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "zovus:refund-disabled-scene-images:v1",
    ]);

    const before = await loadAggregate();
    assertAuditedPopulation(before.rows, before.totals);

    const { rows: targetUsers } = await client.query(
      `SELECT DISTINCT s.user_id
       FROM rune_transactions s
       WHERE s.type = 'spend'
         AND s.amount < 0
         AND s.action_type = ANY($1::text[])
         AND s.created_at <= $2::timestamptz
       ORDER BY s.user_id`,
      [ACTIONS, AUDIT_CUTOFF]
    );
    const userIds = targetUsers.map((row) => row.user_id);
    if (userIds.length) {
      await client.query(
        `SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [userIds]
      );
    }

    const { rows: pending } = await client.query(
      `SELECT s.id, s.user_id, s.action_type, (-s.amount)::int AS refund_amount
       FROM rune_transactions s
       WHERE s.type = 'spend'
         AND s.amount < 0
         AND s.action_type = ANY($1::text[])
         AND s.created_at <= $2::timestamptz
         AND NOT EXISTS (
           SELECT 1 FROM rune_transactions r
           WHERE r.type = 'refund' AND r.refund_of_transaction_id = s.id
         )
       ORDER BY s.user_id, s.created_at, s.id`,
      [ACTIONS, AUDIT_CUTOFF]
    );

    let appliedCount = 0;
    let appliedRunes = 0;
    for (const spend of pending) {
      const { rows: balances } = await client.query(
        "SELECT rune_balance FROM users WHERE id = $1 FOR UPDATE",
        [spend.user_id]
      );
      const currentBalance = Number(balances[0]?.rune_balance);
      if (!Number.isSafeInteger(currentBalance)) throw new Error("Target user no longer exists");

      const { rows: claimed } = await client.query(
        `INSERT INTO rune_transactions (
           user_id, type, amount, balance_after, description, action_type,
           refund_of_transaction_id
         )
         VALUES ($1, 'refund', 0, $2, $3, $4, $5)
         ON CONFLICT (refund_of_transaction_id)
           WHERE type = 'refund' AND refund_of_transaction_id IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [spend.user_id, currentBalance, DESCRIPTION, spend.action_type, spend.id]
      );
      if (!claimed[0]) continue;

      const amount = Number(spend.refund_amount);
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid refund amount");
      const { rows: updated } = await client.query(
        `UPDATE users SET rune_balance = rune_balance + $2
         WHERE id = $1 RETURNING rune_balance`,
        [spend.user_id, amount]
      );
      if (!updated[0]) throw new Error("Target user no longer exists");
      await client.query(
        "UPDATE rune_transactions SET amount = $2, balance_after = $3 WHERE id = $1",
        [claimed[0].id, amount, updated[0].rune_balance]
      );
      appliedCount += 1;
      appliedRunes += amount;
    }

    const after = await loadAggregate();
    assertAuditedPopulation(after.rows, after.totals);
    await client.query("COMMIT");
    console.log(`applied refunds=${appliedCount} runes=${appliedRunes}`);
    printAudit(after.rows, after.totals, "applied");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

try {
  await client.connect();
  if (apply) {
    await applyRefunds();
  } else {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      const audit = await loadAggregate();
      assertAuditedPopulation(audit.rows, audit.totals);
      printAudit(audit.rows, audit.totals, "dry-run");
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end().catch(() => undefined);
}
