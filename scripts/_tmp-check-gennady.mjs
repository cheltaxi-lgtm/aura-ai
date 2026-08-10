import { readFileSync } from "node:fs";
import pg from "pg";

for (const line of readFileSync("/opt/aura-ai/.env.local", "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (!m || process.env[m[1]]) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  process.env[m[1]] = v;
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const uid = "2383df09-bb04-444d-9672-b9f3afd8c34c";
const u = await c.query(`SELECT id, name, rune_balance FROM users WHERE id=$1`, [uid]);
console.log("user", u.rows[0]);
const tx = await c.query(
  `SELECT id, action_type, type, amount, created_at
   FROM rune_transactions
   WHERE user_id=$1 AND action_type LIKE 'HD%'
   ORDER BY created_at DESC LIMIT 10`,
  [uid]
);
console.log("hd_txs", JSON.stringify(tx.rows, null, 2));
const acc = await c.query(
  `SELECT id, email, role FROM user_accounts WHERE profile_user_id=$1`,
  [uid]
);
console.log("account", acc.rows[0]);
await c.end();
