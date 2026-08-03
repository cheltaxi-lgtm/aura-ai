#!/usr/bin/env npx tsx
/**
 * B7 — emergency pause ALL campaigns via Direct API only.
 * No Next.js, no DB. Reads tokens from .env.local.
 *
 * Usage:
 *   npx tsx scripts/ads-stop.ts
 *   npx tsx scripts/ads-stop.ts --dry-run
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq);
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function baseUrl() {
  const sandbox =
    process.env.ADS_DIRECT_SANDBOX === "1" || process.env.ADS_DIRECT_SANDBOX === "true";
  return sandbox
    ? "https://api-sandbox.direct.yandex.com/json/v5"
    : "https://api.direct.yandex.com/json/v5";
}

async function direct(service: string, method: string, params: unknown) {
  const token = process.env.ADS_DIRECT_TOKEN;
  const login = process.env.ADS_DIRECT_LOGIN || "";
  if (!token) throw new Error("ADS_DIRECT_TOKEN missing in .env.local");
  const res = await fetch(`${baseUrl()}/${service}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Login": login,
      "Accept-Language": "ru",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method, params }),
  });
  const units = res.headers.get("Units");
  const json = (await res.json()) as {
    result?: { Campaigns?: { Id: number; Name: string; State: string }[] };
    error?: { error_string?: string; error_code?: number };
  };
  if (json.error) {
    throw new Error(json.error.error_string || `Direct error ${json.error.error_code}`);
  }
  return { result: json.result, units };
}

async function main() {
  loadEnvLocal();
  const dry = process.argv.includes("--dry-run");
  console.log(`ads-stop ${dry ? "(dry-run)" : "(LIVE)"} sandbox=${process.env.ADS_DIRECT_SANDBOX}`);

  const { result, units } = await direct("campaigns", "get", {
    SelectionCriteria: {},
    FieldNames: ["Id", "Name", "State", "Status"],
  });
  const campaigns = result?.Campaigns || [];
  const ids = campaigns.map((c) => c.Id);
  console.log(`found ${ids.length} campaigns; Units=${units}`);
  for (const c of campaigns) {
    console.log(`  ${c.Id} ${c.State} ${c.Name}`);
  }

  if (!ids.length) {
    console.log("OK: nothing to pause");
    return;
  }
  if (dry) {
    console.log("DRY-RUN: would suspend", ids.join(","));
    return;
  }

  const sus = await direct("campaigns", "suspend", {
    SelectionCriteria: { Ids: ids },
  });
  console.log("SUSPENDED", ids.join(","), "Units=", sus.units);
  console.log("OK ads-stop complete");
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
