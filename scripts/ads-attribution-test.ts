#!/usr/bin/env npx tsx
/**
 * Integration test F1 attribution: click → micro → link → server conversion path.
 * Requires DATABASE_URL and migrated ads schema.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function loadEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq);
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

async function main() {
  const { createClick, linkClickUser, recordMicroConversion, recordServerConversion } =
    await import("../src/modules/ads/attribution");
  const { adsQuery } = await import("../src/modules/ads/db");

  const sch = await adsQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM information_schema.tables
     WHERE table_schema='ads' AND table_name='click'`
  );
  if (Number(sch.rows[0]?.n || 0) < 1) {
    console.error("FAIL: ads.click missing — run migrate");
    process.exit(1);
  }

  const clickId = await createClick({
    yclid: `test-${Date.now()}`,
    utm_source: "yandex",
    utm_medium: "cpc",
    landing_path: "/numerology/destiny-matrix",
    visitor_hash: "vhash-test",
  });
  const m1 = await recordMicroConversion(clickId, "deck_view", "vhash-test");
  const m2 = await recordMicroConversion(clickId, "deck_view", "vhash-test");
  if (m1 !== "ok") throw new Error(`deck_view expected ok got ${m1}`);
  if (m2 !== "ok" && m2 !== "duplicate") throw new Error(`unexpected ${m2}`);

  const userId = randomUUID();
  const linked = await linkClickUser(clickId, userId);
  if (!linked) throw new Error("link failed");
  const linked2 = await linkClickUser(clickId, userId);
  if (linked2) throw new Error("link should be idempotent (second insert no-op)");

  await recordServerConversion({
    userId,
    type: "registration",
    amountRub: null,
  });

  const { rows } = await adsQuery<{ type: string }>(
    `SELECT type FROM ads.conversion WHERE click_id=$1::uuid OR user_id=$2::uuid`,
    [clickId, userId]
  );
  const types = new Set(rows.map((r) => r.type));
  if (!types.has("deck_view") || !types.has("registration")) {
    throw new Error(`missing conversions: ${[...types].join(",")}`);
  }

  await adsQuery(`DELETE FROM ads.conversion WHERE click_id=$1::uuid OR user_id=$2::uuid`, [
    clickId,
    userId,
  ]);
  await adsQuery(`DELETE FROM ads.click_user WHERE click_id=$1::uuid`, [clickId]);
  await adsQuery(`DELETE FROM ads.click WHERE id=$1::uuid`, [clickId]);

  console.log("PASS attribution integration");
}

main().catch((e) => {
  const msg =
    e instanceof Error
      ? e.message || e.name || String(e)
      : String(e);
  const code = e && typeof e === "object" && "code" in e ? String((e as { code?: string }).code) : "";
  console.error("FAIL", code || msg || "unknown_db_error");
  process.exit(1);
});
