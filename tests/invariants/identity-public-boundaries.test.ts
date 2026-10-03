import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/maintenance-mode", () => ({ fetchMaintenanceModeActive: async () => false, isMaintenanceBypassPath: () => false, isSearchEngineBot: () => false, MAINTENANCE_BOT_RETRY_AFTER_SEC: 60, MAINTENANCE_PAGE_PATH: "/maintenance" }));
import { middleware } from "@/middleware";
import { resolveJointParticipantRole, resolveJointReadParticipantRole, type JointReadingRow } from "@/lib/joint-reading-service";

describe("public capability privacy boundaries", () => {
  const emptyInvite = { initiator_user_id: "A", partner_user_id: null, partner_reading: null, combined_reading: null, synastry_data: null } as JointReadingRow;
  it("admits a new invited partner without granting private read access", () => {
    expect(resolveJointParticipantRole(emptyInvite, "B")).toBe("partner");
    expect(resolveJointReadParticipantRole(emptyInvite, "B")).toBeNull();
    const claimed = { ...emptyInvite, partner_user_id: "B" };
    expect(resolveJointReadParticipantRole(claimed, "B")).toBe("partner");
    expect(resolveJointReadParticipantRole(claimed, "A")).toBe("initiator");
    expect(resolveJointReadParticipantRole(claimed, "C")).toBeNull();
  });
  it.each(["partner_reading", "combined_reading", "synastry_data"] as const)("does not reopen a lost partner slot with retained %s", field => {
    const orphaned = { ...emptyInvite, [field]: field === "synastry_data" ? {} : "Erased private text" };
    expect(resolveJointParticipantRole(orphaned, "C")).toBeNull();
    expect(resolveJointReadParticipantRole(orphaned, "C")).toBeNull();
  });
  it("permits the exact unsubscribe endpoint while retaining notification API auth", async () => {
    expect((await middleware(new NextRequest("https://zovus.ru/api/notifications/unsubscribe?token=fixture"))).headers.get("x-middleware-next")).toBe("1");
    expect((await middleware(new NextRequest("https://zovus.ru/api/notifications"))).status).toBe(401);
    expect((await middleware(new NextRequest("https://zovus.ru/api/notifications/unsubscribe-extra"))).status).toBe(401);
  });
});
