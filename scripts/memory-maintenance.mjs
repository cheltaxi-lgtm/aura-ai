/**
 * Memory maintenance (cron): re-embed any long-term facts that were stored
 * without a vector (e.g. inserted while the embeddings provider was briefly
 * unavailable). Idempotent and safe to run repeatedly. Mirrors
 * runMemoryMaintenance() in user-facts.ts but talks to Postgres + OpenRouter
 * directly so it needs no running app / admin auth.
 *
 * Run:  DATABASE_URL=... OPENROUTER_API_KEY=... node scripts/memory-maintenance.mjs [limit]
 */
import pg from "pg";

const EMBED_API = "https://openrouter.ai/api/v1/embeddings";
const EMBED_MODEL = process.env.MEMORY_EMBED_MODEL || "baai/bge-m3";
const API_KEY = process.env.OPENROUTER_API_KEY || "";
const LIMIT = Math.min(Number(process.argv[2]) || 500, 5000);
/** Mirrors CRITICAL_DECAY_AFTER_DAYS in src/lib/memory/user-facts.ts. */
const CRITICAL_DECAY_AFTER_DAYS = 120;

async function embed(text) {
  if (!API_KEY) return null;
  try {
    const r = await fetch(EMBED_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: String(text).slice(0, 4000) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.data?.[0]?.embedding;
    return Array.isArray(v) && v.length === 1024 ? v : null;
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("memory-maintenance: DATABASE_URL not set — skipping.");
    return;
  }
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query(
      `SELECT id, fact FROM user_facts WHERE embedding IS NULL ORDER BY updated_at ASC LIMIT $1`,
      [LIMIT]
    );
    let reembedded = 0;
    for (const r of rows) {
      const v = await embed(r.fact);
      if (!v) {
        console.warn("memory-maintenance: embeddings unavailable, stopping early.");
        break;
      }
      await c.query(`UPDATE user_facts SET embedding = $2::vector WHERE id = $1`, [
        r.id,
        `[${v.join(",")}]`,
      ]);
      reembedded++;
    }
    console.log(`memory-maintenance: scanned ${rows.length}, re-embedded ${reembedded}`);

    const decay = await c.query(
      `UPDATE user_facts
          SET salience = 4
        WHERE id IN (
          SELECT id FROM user_facts
           WHERE salience >= 5
             AND event_date IS NULL
             AND updated_at < NOW() - ($1 || ' days')::interval
           LIMIT 500
        )
        RETURNING id`,
      [String(CRITICAL_DECAY_AFTER_DAYS)]
    );
    console.log(`memory-maintenance: decayed ${decay.rowCount} stale critical fact(s)`);

    // Mirrors MAX_SESSION_MEMORIES_PER_USER in src/lib/session-memory.ts.
    const sessionsPruned = await c.query(
      `DELETE FROM session_memories
        WHERE id IN (
          SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY user_id ORDER BY session_date DESC
                   ) AS rn
              FROM session_memories
          ) ranked
          WHERE ranked.rn > 200
        )`
    );
    console.log(`memory-maintenance: pruned ${sessionsPruned.rowCount} excess session memorie(s)`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("memory-maintenance: fatal:", e.message);
  process.exit(1);
});
