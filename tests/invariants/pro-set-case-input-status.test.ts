import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * setCaseInput must not force status='input_ready' over generating /
 * delivered / archived — otherwise async generate looks "stuck" after refresh.
 */
describe("pro setCaseInput status preserve", () => {
  it("preserves generating/delivered/archived when updating input payload", () => {
    const src = readFileSync(
      join(process.cwd(), "src/modules/pro/db/cases.ts"),
      "utf8"
    );
    expect(src).toMatch(/WHEN status IN \('generating', 'delivered', 'archived'\)/);
    expect(src).not.toMatch(
      /UPDATE pro\.cases SET status = 'input_ready', updated_at = NOW\(\)\s*\n\s*WHERE id = \$1 AND account_id = \$2 RETURNING \*/
    );
  });
});
