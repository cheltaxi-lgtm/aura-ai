#!/usr/bin/env node
/** List recent YooKassa payments and optionally reconcile succeeded rune purchases. */
import { readFileSync } from "node:fs";

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "").replace(/\r$/, "");
    }
  } catch {
    /* ignore */
  }
}

loadEnv("/opt/aura-ai/.env.local");

const shopId = process.env.YUKASSA_SHOP_ID?.trim();
const secret = process.env.YUKASSA_SECRET_KEY?.trim();
if (!shopId || !secret) {
  console.error("YUKASSA not configured");
  process.exit(1);
}

const auth = "Basic " + Buffer.from(`${shopId}:${secret}`).toString("base64");
const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

const res = await fetch(
  `https://api.yookassa.ru/v3/payments?created_at.gte=${encodeURIComponent(since)}&limit=20`,
  { headers: { Authorization: auth, "Content-Type": "application/json" } }
);

if (!res.ok) {
  console.error("YooKassa list failed:", res.status, await res.text());
  process.exit(1);
}

const data = await res.json();
const items = data.items ?? [];

console.log(`Recent payments since ${since} (${items.length}):`);
for (const p of items) {
  const meta = p.metadata ?? {};
  console.log(
    [
      p.id,
      p.status,
      p.amount?.value,
      meta.type ?? meta.plan ?? "-",
      meta.userId?.slice(0, 8) ?? "-",
      meta.packageId ?? "-",
      p.created_at,
    ].join(" | ")
  );
}
