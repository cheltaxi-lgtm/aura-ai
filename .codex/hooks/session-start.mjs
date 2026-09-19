#!/usr/bin/env node
/** sessionStart: short harness reminder. Fail-open. */
try {
  process.stdout.write(
    `${JSON.stringify({
      additional_context:
        "For Zovus product implementation and requested execution audits, use .agents/skills/zovus-harness/SKILL.md for scoped checks, independent review and fresh completion evidence. Read-only analysis and documentation-only tasks do not require product tests. Use --audit only for explicit audits; reuse current passing evidence. See docs/AI_HARNESS.md when needed.",
    })}\n`
  );
} catch {
  process.stdout.write("{}\n");
}
process.exit(0);
