import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync("/opt/aura-ai/.env.local", "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1).trim();
  }
}
loadEnv();
const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(
  `SELECT content FROM chat_messages
   WHERE owner_user_id = $1 AND character_id = 'ragnar' AND role = 'assistant'
   ORDER BY created_at DESC LIMIT 1`,
  ["2383df09-bb04-444d-9672-b9f3afd8c34c"]
);
console.log(rows[0]?.content ?? "none");
await pool.end();
