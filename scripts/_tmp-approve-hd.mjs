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

const { approveHdReportManually } = await import(
  "../src/lib/services/human-design-service.ts"
);

const reportId = "91cbfb3b-27c2-4f25-b753-548daf4207c4";
const ok = await approveHdReportManually(reportId);
console.log(JSON.stringify({ approved: ok, reportId }));

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(
  `SELECT id, status, length(coalesce(report_text,'')) len, updated_at FROM hd_reports WHERE id=$1`,
  [reportId]
);
console.log("row", r.rows[0]);
await c.query(
  `UPDATE async_jobs
   SET status='completed', error_code=NULL, error_message=NULL, updated_at=NOW()
   WHERE id=$1 AND status='needs_regeneration'`,
  ["428b0e3e-dcc5-472f-bec0-f92ccf76d943"]
);
await c.end();
