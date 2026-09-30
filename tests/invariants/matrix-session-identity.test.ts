import { describe, expect, it, vi } from "vitest";
import { matrixSessionIdentity } from "@/lib/numerology/matrix-session-identity";

const { query, deleteConsultationSession } = vi.hoisted(() => ({
  query: vi.fn(), deleteConsultationSession: vi.fn(async () => true),
}));
vi.mock("@/lib/db", () => ({ query }));
vi.mock("@/lib/session", () => ({ deleteConsultationSession }));
import { purgeMatrixConsultationSessions } from "@/lib/numerology/matrix-session-cleanup";

describe("matrix report identity isolation", () => {
  it("replaces all identity fields with the delivered historical report", () => {
    const snapshot = { birth: { iso: "1990-08-15" }, asOf: { date: "2025-08-01" } };
    expect(matrixSessionIdentity({ matrixBirthDate: "1990-08-15", matrixCalculationVersion: "v4", matrixStructuredData: snapshot, matrixAsOf: "2025-08-01", sessionCreatedAt: "2026-09-30" })).toEqual({ birthDate: "1990-08-15", calculationVersion: "v4", structuredData: snapshot, asOf: "2025-08-01" });
  });
  it("clears stale subject and snapshot when metadata is absent", () => {
    expect(matrixSessionIdentity({})).toEqual({ birthDate: null, calculationVersion: null, structuredData: null, asOf: null });
    expect(matrixSessionIdentity({ matrixStructuredData: [] }).structuredData).toBeNull();
  });
  it("never searches for or deletes unrelated unlinked chats", async () => {
    query.mockClear(); deleteConsultationSession.mockClear();
    expect(await purgeMatrixConsultationSessions("owner", ["session-A", "session-A", ""])).toBe(1);
    expect(query).not.toHaveBeenCalled();
    expect(deleteConsultationSession).toHaveBeenCalledExactlyOnceWith("session-A", "owner");
    deleteConsultationSession.mockClear();
    expect(await purgeMatrixConsultationSessions("owner")).toBe(0);
    expect(deleteConsultationSession).not.toHaveBeenCalled();
  });
});
