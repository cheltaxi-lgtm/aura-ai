import { describe, expect, it } from "vitest";
import { asyncJobMatchesContext } from "@/lib/client/wait-for-async-job";

describe("Matrix async resume identity", () => {
  const context = { sessionId: "session-A", characterId: "numerolog", matrixSubjectId: "subject-A" };
  const job = { status: "completed", kind: "numerology_reading", context };
  it("resumes only the exact master, session, subject and product kind", () => {
    expect(asyncJobMatchesContext(job, { kind: "numerology_reading", context })).toBe(true);
    for (const changed of [{ sessionId: "session-B" }, { characterId: "tarolog" }, { matrixSubjectId: "subject-B" }]) {
      expect(asyncJobMatchesContext(job, { kind: "numerology_reading", context: { ...context, ...changed } })).toBe(false);
    }
    expect(asyncJobMatchesContext(job, { kind: "reading", context })).toBe(false);
    expect(asyncJobMatchesContext({ ...job, context: undefined }, { context })).toBe(false);
  });
});
