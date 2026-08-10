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
const userId = "2383df09-bb04-444d-9672-b9f3afd8c34c";
const job = await c.query(
  `select id, status, billing_state, charge_transaction_id, attempt_count,
          created_at, updated_at, error_code
   from async_jobs where id=$1`,
  ["428b0e3e-dcc5-472f-bec0-f92ccf76d943"]
);
console.log("job", job.rows[0]);
const tx = await c.query(
  `select id, action_type, type, amount, created_at
   from rune_transactions
   where user_id=$1 and created_at > $2::timestamptz - interval '5 minutes'
     and created_at < $3::timestamptz + interval '5 minutes'
   order by created_at`,
  [userId, job.rows[0].created_at, job.rows[0].updated_at]
);
console.log("txs", JSON.stringify(tx.rows, null, 2));
const bal = await c.query(`select rune_balance, name from users where id=$1`, [userId]);
console.log("user", bal.rows[0]);
const rep = await c.query(
  `select id, status, transaction_id, error, length(coalesce(report_text,'')) len
   from hd_reports where id=$1`,
  ["91cbfb3b-27c2-4f25-b753-548daf4207c4"]
);
console.log("report", rep.rows[0]);
await c.end();
