import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * HD input edits cancel the old generation; other Pro practices preserve generating /
 * delivered / archived — otherwise async generate looks "stuck" after refresh.
 */
describe("pro setCaseInput status preserve", () => {
  it("cancels stale HD generation while preserving non-HD and delivered/archive statuses", () => {
    const src = readFileSync(
      join(process.cwd(), "src/modules/pro/db/cases.ts"),
      "utf8"
    );
    expect(src).toContain("WHEN status IN ('delivered','archived') THEN status");
    expect(src).toContain("WHEN status='generating' AND type<>'hd' THEN status");
    expect(src).not.toMatch(
      /UPDATE pro\.cases SET status = 'input_ready', updated_at = NOW\(\)\s*\n\s*WHERE id = \$1 AND account_id = \$2 RETURNING \*/
    );
  });
});
