import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { validateHdReportText } from "../src/lib/hd-report-quality/validator.ts";

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
const r = await c.query(
  `SELECT report_text, quality_findings FROM hd_reports WHERE id=$1`,
  ["91cbfb3b-27c2-4f25-b753-548daf4207c4"]
);
const text = r.rows[0]?.report_text || "";
writeFileSync("/tmp/hd_gennady_draft.md", text);
console.log("stored_findings", JSON.stringify(r.rows[0]?.quality_findings));
const q = validateHdReportText(text, { requireFocusAnswer: false });
console.log(
  JSON.stringify({
    ok: q.ok,
    findings: (q.findings || []).map((f) => ({
      rule: f.rule,
      detail: String(f.detail || "").slice(0, 160),
    })),
  })
);
await c.end();
