#!/usr/bin/env npx tsx
/**
 * Run semantics pipeline (dry-run by default).
 * Usage: npx tsx scripts/ads-semantics.ts [--dry-run]
 */
import { collectRaw, processKeywords } from "../src/modules/ads/semantics/run";
import { getBudget } from "../src/modules/ads/config";

async function main() {
  const dry = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
  const budget = await getBudget().catch(() => null);
  const freqMin = budget?.discovery_freq_min ?? 100;
  const freqMax = budget?.discovery_freq_max ?? 5000;
  const raw = await collectRaw();
  const processed = processKeywords(raw, { freqMin, freqMax });
  const pending = processed.filter((p) => p.status === "pending");
  const rejected = processed.filter((p) => p.status === "rejected");
  console.log(
    JSON.stringify(
      {
        dry_run: dry,
        raw: raw.length,
        pending: pending.length,
        rejected: rejected.length,
        sample: pending.slice(0, 10).map((p) => ({
          phrase: p.phrase,
          landing: p.landingPath,
          freq: p.freqExact ?? p.freqPhrase,
        })),
      },
      null,
      2
    )
  );
  if (!dry) {
    const { persistCandidates } = await import("../src/modules/ads/semantics/run");
    const n = await persistCandidates(processed);
    console.log(`persisted=${n}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
