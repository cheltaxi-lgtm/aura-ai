#!/usr/bin/env npx tsx
/**
 * Build discovery plan (dry-run).
 * Usage: npx tsx scripts/ads-plan.ts --config config/ads/matrix-destiny.yaml [--dry-run]
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildDiscoveryPlan, pushDiscoveryCampaign } from "../src/modules/ads/generator";

function parseArgs() {
  const argv = process.argv.slice(2);
  let config = "config/ads/matrix-destiny.yaml";
  let dryRun = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) config = argv[++i];
    if (argv[i] === "--apply") dryRun = false;
    if (argv[i] === "--dry-run") dryRun = true;
  }
  return { config, dryRun };
}

async function main() {
  const { config, dryRun } = parseArgs();
  const path = join(process.cwd(), config);
  if (!existsSync(path)) {
    console.error(`config missing: ${config}`);
    process.exit(1);
  }
  const yaml = require("yaml") as { parse: (s: string) => Record<string, unknown> };
  const cfg = yaml.parse(readFileSync(path, "utf8")) || {};
  const seeds = (cfg.seed_keywords as { phrase: string; freq?: number }[]) || [];
  const plan = await buildDiscoveryPlan({
    keywords: seeds.map((s) => ({ phrase: s.phrase, freq: s.freq ?? null })),
  });
  console.log(JSON.stringify({ dry_run: dryRun, plan }, null, 2));
  if (!dryRun) {
    const res = await pushDiscoveryCampaign({ plan, dryRun: false });
    console.log(JSON.stringify({ push: res }, null, 2));
  } else {
    const res = await pushDiscoveryCampaign({ plan, dryRun: true });
    console.log(JSON.stringify({ push: res }, null, 2));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
