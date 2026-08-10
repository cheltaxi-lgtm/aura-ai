import { readFileSync } from "node:fs";
import { SignJWT } from "jose";
import pg from "pg";

for (const line of readFileSync("/opt/aura-ai/.env.local", "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (!m || process.env[m[1]]) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const BASE = "http://127.0.0.1:3000";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(
  `SELECT id, email, name, profile_user_id, token_version FROM user_accounts WHERE id=$1`,
  ["e6a7f708-4bd6-46f1-a3c7-0b34ceb803d2"]
);
const acc = rows[0];
await c.query(`UPDATE users SET rune_balance = GREATEST(rune_balance, 500) WHERE id=$1`, [
  acc.profile_user_id,
]);
const token = await new SignJWT({
  sub: acc.id,
  role: "user",
  email: acc.email,
  name: acc.name || "Smoke",
  tv: Number(acc.token_version) || 0,
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
const cookie = `aura_auth=${token}`;

await fetch(`${BASE}/api/age-gate/confirm`, {
  method: "POST",
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify({ confirmed: true }),
});

const enq = await fetch(`${BASE}/api/intention-spread`, {
  method: "POST",
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify({
    characterId: "veronika",
    spreadId: "situation-5",
    intention: "custom",
    customQuestion: "Smoke restore check: will this situation resolve soon for me?",
    async: true,
    aiDataUseAcknowledged: true,
  }),
});
const enqJson = await enq.json().catch(() => ({}));
console.log("enqueue", enq.status, JSON.stringify(enqJson).slice(0, 300));
const jobId = enqJson.jobId;
if (!jobId) {
  await c.end();
  process.exit(2);
}

const t0 = Date.now();
while (Date.now() - t0 < 180_000) {
  const { rows: j } = await c.query(
    `SELECT status, error_code, left(coalesce(error_message,''),100) em FROM async_jobs WHERE id=$1`,
    [jobId]
  );
  const row = j[0];
  console.log("poll", row.status, row.error_code || row.em || "");
  if (["completed", "failed", "needs_regeneration"].includes(row.status)) {
    await c.end();
    process.exit(row.status === "completed" ? 0 : 3);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
await c.end();
console.log("timeout");
process.exit(4);
