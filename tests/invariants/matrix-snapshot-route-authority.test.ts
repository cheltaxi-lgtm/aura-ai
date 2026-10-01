import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ persist: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/db", () => ({ ensureDb: async () => true }));
vi.mock("@/lib/require-auth", () => ({ requireProfileUserId: async () => ({ profileUserId: "owner" }) }));
vi.mock("@/lib/api-guards", () => ({ enforcePaidRouteRateLimit: async () => null }));
vi.mock("@/lib/services/matrix-subject-service", () => ({ isMatrixSubjectKind: () => true }));
vi.mock("@/lib/services/matrix-snapshot-persist", () => ({
  persistOwnedMatrixSnapshot: mocks.persist,
  getOwnedMatrixSnapshot: mocks.get, getOwnedSelfMatrixSnapshot: mocks.get,
}));
import { POST, GET } from "@/app/api/numerology/matrix-snapshot/route";
import { destinyMatrix, matrixToStructuredData } from "@/lib/numerology/destiny-matrix";

describe("public matrix snapshot authority", () => {
  it("rejects a snapshot for another DOB and returns canonical titles for the selected DOB", async () => {
    const snapshot = matrixToStructuredData(destinyMatrix("1988-03-03", { asOfDate: "2026-09-30" })!, "1988-03-03");
    mocks.get.mockResolvedValue({ subjectId: "subject", birthDate: "1990-08-15", snapshot });
    expect((await GET(new NextRequest("http://localhost/api/numerology/matrix-snapshot"))).status).toBe(404);
    const valid = matrixToStructuredData(destinyMatrix("1990-08-15", { asOfDate: "2026-09-30" })!, "1990-08-15");
    valid.money = { ...valid.money as object, arcanaName: "Сила" };
    mocks.get.mockResolvedValue({ subjectId: "subject", birthDate: "1990-08-15", snapshot: valid });
    const response = await GET(new NextRequest("http://localhost/api/numerology/matrix-snapshot"));
    expect(response.status).toBe(200);
    expect((await response.json()).snapshot.money.arcanaName).toBe("Император");
  });
  beforeEach(() => { mocks.persist.mockResolvedValue({ subjectId: "subject", birthDate: "1990-05-15" }); });
  it("passes birth inputs to server calculation without accepting client calculation output", async () => {
    const response = await POST(new NextRequest("http://localhost/api/numerology/matrix-snapshot", {
      method: "POST", body: JSON.stringify({ birthDate: "1990-05-15", snapshot: { body: { number: 22 } }, asOfDate: "1900-01-01", calculationVersion: "client-version" }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.persist).toHaveBeenCalledWith({ userId: "owner", birthDate: "1990-05-15", displayName: null, subjectKind: "self", subjectId: null });
  });
});
