import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    const raw = readFileSync("/opt/aura-ai/.env.local", "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1).trim();
    }
  } catch {}
}

loadEnv();
const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const userId = "2383df09-bb04-444d-9672-b9f3afd8c34c";
const { rows } = await pool.query(
  `SELECT role, left(content, 200) AS content, character_id, created_at
   FROM chat_messages
   WHERE owner_user_id = $1
   ORDER BY created_at DESC
   LIMIT 12`,
  [userId]
);

for (const r of rows.reverse()) {
  console.log(`${r.created_at.toISOString()} [${r.character_id}] ${r.role}:`);
  console.log(r.content);
  console.log("---");
}

await pool.end();
