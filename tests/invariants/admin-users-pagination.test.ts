import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listUserAccounts: vi.fn(),
  countUserAccounts: vi.fn(),
  listOnboardingProfiles: vi.fn(),
  countOnboardingProfiles: vi.fn(),
  getActivationDiagnostics: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin", () => ({
  listUserAccounts: mocks.listUserAccounts,
  countUserAccounts: mocks.countUserAccounts,
  listOnboardingProfiles: mocks.listOnboardingProfiles,
  countOnboardingProfiles: mocks.countOnboardingProfiles,
}));
vi.mock("@/lib/activation-store", () => ({ getActivationDiagnostics: mocks.getActivationDiagnostics }));

import { GET } from "@/app/api/admin/users/route";

describe("admin users pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ sub: "synthetic-admin" });
    mocks.listUserAccounts.mockResolvedValue([{ id: "account-51" }]);
    mocks.countUserAccounts.mockResolvedValue(74);
    mocks.listOnboardingProfiles.mockResolvedValue([{ id: "profile-51" }]);
    mocks.countOnboardingProfiles.mockResolvedValue(79);
    mocks.getActivationDiagnostics.mockResolvedValue({ stages: [], events: [] });
  });

  it("returns the second account page with the full filtered total", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/users?type=accounts&limit=50&offset=50"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ id: "account-51" }], total: 74, limit: 50, offset: 50 });
    expect(mocks.listUserAccounts).toHaveBeenCalledWith(50, 50, false);
    expect(mocks.countUserAccounts).toHaveBeenCalledWith(false);
  });

  it("pages profiles independently and respects the test-record toggle", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/users?type=profiles&offset=50&includeTest=1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ id: "profile-51" }], total: 79, limit: 50, offset: 50 });
    expect(mocks.listOnboardingProfiles).toHaveBeenCalledWith(50, 50, true);
    expect(mocks.countOnboardingProfiles).toHaveBeenCalledWith(true);
  });

  it("rejects invalid pagination without issuing a list query", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/users?type=accounts&offset=-1"));
    expect(response.status).toBe(400);
    expect(mocks.listUserAccounts).not.toHaveBeenCalled();
    expect(mocks.countUserAccounts).not.toHaveBeenCalled();
  });
});
