import { describe, expect, it } from "vitest";
import { getLandingSocialProofStats } from "@/lib/landing-social-proof";

describe("honest public platform totals", () => {
  it("shows the server totals without synthetic growth or online users", () => {
    expect(getLandingSocialProofStats({ users: 68, sessions: 321 })).toEqual([
      { key: "users", value: "68", label: "зарегистрированы" },
      { key: "total", value: "321", label: "сеансов начато" },
    ]);
  });
  it("distinguishes unavailable totals from a measured zero", () => {
    expect(getLandingSocialProofStats().map(s => s.value)).toEqual(["—", "—"]);
    expect(getLandingSocialProofStats({ users: 0, sessions: 0 }).map(s => s.value)).toEqual(["0", "0"]);
    expect(getLandingSocialProofStats({ users: -1, sessions: NaN }).map(s => s.value)).toEqual(["—", "—"]);
  });
});
