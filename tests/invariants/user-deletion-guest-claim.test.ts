import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

describe("user deletion vs claimed guest rows", () => {
  it("wipes claimed guest Matrix/Natal rows before DELETE users", () => {
    const src = readFileSync(path.join(ROOT, "src/lib/user-deletion.ts"), "utf8");
    const wipe = src.slice(src.indexOf("export async function deleteUserAccountCompletely"));
    expect(wipe).toContain("DELETE FROM matrix_guest_pending WHERE claimed_user_id");
    expect(wipe).toContain("DELETE FROM matrix_pair_guest_pending WHERE claimed_user_id");
    expect(wipe).toContain("DELETE FROM natal_guest_charts WHERE claimed_user_id");
    expect(wipe.indexOf("DELETE FROM matrix_guest_pending")).toBeLessThan(
      wipe.indexOf("DELETE FROM users WHERE id")
    );
  });
});
