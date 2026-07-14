import { readFileSync } from "node:fs";

function loadEnv(path) {
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1).trim();
  }
}

const envPath = process.argv[2] || "/opt/aura-ai/.env.local";
loadEnv(envPath);

const limit = Number(process.argv[3] || 5);
const sessionId = process.argv[4];

const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

if (sessionId) {
  const { rows } = await pool.query(
    `SELECT id, role, LEFT(content, 200) AS content, created_at
     FROM chat_messages WHERE session_id = $1 ORDER BY created_at`,
    [sessionId]
  );
  const { rows: sess } = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [sessionId]);
  console.log(JSON.stringify({ session: sess[0], messages: rows }, null, 2));
} else {
  const { rows } = await pool.query(
    `
  SELECT s.id, s.character_key, s.spread_id, s.spread_type, s.cards, s.status, s.created_at,
         (SELECT COUNT(*)::int FROM chat_messages cm WHERE cm.session_id = s.id) AS msg_count,
         (SELECT LEFT(cm.content, 160) FROM chat_messages cm
          WHERE cm.session_id = s.id AND cm.role = 'assistant'
          ORDER BY cm.created_at DESC LIMIT 1) AS last_assistant
  FROM sessions s
  WHERE s.character_key = 'numerolog'
  ORDER BY s.created_at DESC
  LIMIT $1
`,
    [limit]
  );
  console.log(JSON.stringify(rows, null, 2));
}
await pool.end();
