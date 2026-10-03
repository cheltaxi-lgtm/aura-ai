import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ admin: vi.fn(), ready: vi.fn(), prune: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: state.admin }));
vi.mock("@/lib/db", () => ({ ensureDb: state.ready }));
vi.mock("@/lib/email/log", () => ({ pruneOwnerlessEmailLogs: state.prune, OWNERLESS_EMAIL_LOG_RETENTION_DAYS: 30, EMAIL_LOG_RETENTION_BATCH_LIMIT: 1000 }));
import { GET } from "@/app/api/cron/email-log-retention/route";

describe("email diagnostic retention authorization", () => {
  beforeEach(() => {
    state.admin.mockReset().mockResolvedValue(null);
    state.ready.mockReset().mockResolvedValue(true);
    state.prune.mockReset().mockResolvedValue(4);
    vi.stubEnv("CRON_SECRET", "retention-fixture-secret");
  });
  afterEach(() => vi.unstubAllEnvs());
  const request = (secret?: string) => new NextRequest("https://zovus.ru/api/cron/email-log-retention", { headers: secret ? { "x-cron-secret": secret } : {} });

  it.each([undefined, "wrong-secret"])("rejects an unauthenticated caller before checking DB or deleting diagnostics (%s)", async secret => {
    expect((await GET(request(secret))).status).toBe(401);
    expect(state.ready).not.toHaveBeenCalled();
    expect(state.prune).not.toHaveBeenCalled();
  });
  it("lets the authenticated scheduler run a bounded purge and returns counts only", async () => {
    const response = await GET(request("retention-fixture-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 4, retentionDays: 30, batchLimit: 1000 });
    expect(state.admin).not.toHaveBeenCalled();
    expect(state.prune).toHaveBeenCalledOnce();
  });
  it("allows an active admin through the existing cron auth contract", async () => {
    state.admin.mockResolvedValue({ role: "admin", sub: "fixture-admin" });
    expect((await GET(request())).status).toBe(200);
    expect(state.prune).toHaveBeenCalledOnce();
  });
  it("reports unavailable storage without claiming or running a purge", async () => {
    state.ready.mockResolvedValue(false);
    expect((await GET(request("retention-fixture-secret"))).status).toBe(503);
    expect(state.prune).not.toHaveBeenCalled();
  });
});
