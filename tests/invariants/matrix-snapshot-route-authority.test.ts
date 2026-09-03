import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ persist: vi.fn() }));
vi.mock("@/lib/db", () => ({ ensureDb: async () => true }));
vi.mock("@/lib/require-auth", () => ({ requireProfileUserId: async () => ({ profileUserId: "owner" }) }));
vi.mock("@/lib/api-guards", () => ({ enforcePaidRouteRateLimit: async () => null }));
vi.mock("@/lib/services/matrix-subject-service", () => ({ isMatrixSubjectKind: () => true }));
vi.mock("@/lib/services/matrix-snapshot-persist", () => ({
  persistOwnedMatrixSnapshot: mocks.persist,
  getOwnedMatrixSnapshot: vi.fn(), getOwnedSelfMatrixSnapshot: vi.fn(),
}));
import { POST } from "@/app/api/numerology/matrix-snapshot/route";

describe("public matrix snapshot authority", () => {
  beforeEach(() => { mocks.persist.mockResolvedValue({ subjectId: "subject", birthDate: "1990-05-15" }); });
  it("passes birth inputs to server calculation without accepting client calculation output", async () => {
    const response = await POST(new NextRequest("http://localhost/api/numerology/matrix-snapshot", {
      method: "POST", body: JSON.stringify({ birthDate: "1990-05-15", snapshot: { body: { number: 22 } }, asOfDate: "1900-01-01", calculationVersion: "client-version" }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.persist).toHaveBeenCalledWith({ userId: "owner", birthDate: "1990-05-15", displayName: null, subjectKind: "self", subjectId: null });
  });
});
