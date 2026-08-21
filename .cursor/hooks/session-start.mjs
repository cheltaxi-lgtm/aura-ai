#!/usr/bin/env node
/** sessionStart: short harness reminder. Fail-open. */
try {
  process.stdout.write(
    `${JSON.stringify({
      additional_context:
        "Zovus AI harness is active. Cycle: discover → plan → implement → test → review → fix → retest. COMPLETED only after `node scripts/ai-harness.mjs` verdict PASS. Commands: /audit-matrix /audit-natal /audit-hd /audit-tarot /audit-photo /audit-seo /audit-production /full-audit. See docs/AI_HARNESS.md.",
    })}\n`
  );
} catch {
  process.stdout.write("{}\n");
}
process.exit(0);
