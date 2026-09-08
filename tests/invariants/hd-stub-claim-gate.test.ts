/**
 * HD ownership claim must not require birth-profile completeness.
 * Stub after registration: authenticated + needsBirthProfile → still claimable.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

describe("hd-stub-claim-gate", () => {
  it("HdCalculator splits accountReady from birthProfileReady for claim", () => {
    const src = readFileSync(
      path.join(ROOT, "src/components/human-design/HdCalculator.tsx"),
      "utf8"
    );

    // Must NOT fold needsBirthProfile into a single authenticated gate.
    expect(src).not.toMatch(
      /authenticated\s*&&\s*!d\?\.needsProfile\s*&&\s*!d\?\.needsBirthProfile/
    );
    expect(src).toMatch(/accountReady/);
    expect(src).toMatch(/birthProfileReady/);
    expect(src).toMatch(/const ready = Boolean\(d\?\.authenticated && !d\?\.needsProfile\)/);
    expect(src).toMatch(/setBirthProfileReady\(Boolean\(ready && !d\?\.needsBirthProfile\)\)/);

    // Claim effect is still gated by accountReady only and now waits for the
    // claim result before enabling paid report actions.
    expect(src).toMatch(
      /Claim completes before the report panel[\s\S]{0,220}if \(!accountReady \|\| claimStartedRef\.current\) return;[\s\S]{0,100}void claimGuestCharts/
    );
  });

  it("claim API stays on resolveProfileUserContext (not birth)", () => {
    const src = readFileSync(
      path.join(ROOT, "src/app/api/human-design/claim/route.ts"),
      "utf8"
    );
    expect(src).toMatch(/resolveProfileUserContext/);
    expect(src).not.toMatch(/resolveBirthProfileUserContext/);
  });
});
