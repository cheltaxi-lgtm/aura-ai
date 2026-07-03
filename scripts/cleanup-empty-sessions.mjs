/**
 * Remove abandoned consultation stubs (no chat, no intention, placeholder preview).
 * Safe to run on a schedule — only targets rows older than 48 hours without payments.
 *
 * Run: DATABASE_URL=... node scripts/cleanup-empty-sessions.mjs [limit]
 */
import pg from "pg";

const LIMIT = Math.min(Number(process.argv[2]) || 500, 5000);
const STUB_PREDICTION = "Сеанс в процессе";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("cleanup-empty-sessions: DATABASE_URL not set — skipping.");
    process.exit(0);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT s.id, s.user_id
       FROM sessions s
       LEFT JOIN session_memories sm ON sm.session_id = s.id
       WHERE s.message_count = 0
         AND COALESCE(NULLIF(TRIM(s.intention), ''), '') = ''
         AND s.created_at < NOW() - INTERVAL '48 hours'
         AND NOT EXISTS (
           SELECT 1 FROM payments p
           WHERE p.session_id = s.id AND p.status = 'succeeded'
         )
         AND COALESCE(sm.prediction, $1) = $1
       ORDER BY s.created_at ASC
       LIMIT $2`,
      [STUB_PREDICTION, LIMIT]
    );

    if (rows.length === 0) {
      await client.query("COMMIT");
      console.log("cleanup-empty-sessions: nothing to remove");
      return;
    }

    const ids = rows.map((r) => r.id);
    const idTexts = ids.map((id) => String(id));

    await client.query(
      `UPDATE joint_readings
       SET status = CASE
             WHEN status IN ('pending_partner', 'partner_done') THEN 'expired'
             ELSE status
           END,
           initiator_session_id = CASE
             WHEN initiator_session_id = ANY($1::text[]) THEN NULL
             ELSE initiator_session_id
           END,
           partner_session_id = CASE
             WHEN partner_session_id = ANY($1::text[]) THEN NULL
             ELSE partner_session_id
           END
       WHERE initiator_session_id = ANY($1::text[])
          OR partner_session_id = ANY($1::text[])`,
      [idTexts]
    );

    await client.query(`DELETE FROM session_memories WHERE session_id = ANY($1::uuid[])`, [ids]);
    await client.query(`DELETE FROM chat_messages WHERE session_id = ANY($1::uuid[])`, [ids]);
    await client.query(
      `DELETE FROM history
       WHERE context_data->>'sessionId' = ANY($1::text[])`,
      [idTexts]
    );

    const deleted = await client.query(`DELETE FROM sessions WHERE id = ANY($1::uuid[])`, [ids]);

    await client.query("COMMIT");
    console.log(
      `cleanup-empty-sessions: removed ${deleted.rowCount ?? 0} stub session(s) (scanned ${rows.length})`
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("cleanup-empty-sessions failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
