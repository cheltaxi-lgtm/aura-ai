import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ request: vi.fn(), authCookie: vi.fn(), claimCookie: vi.fn() }));
vi.mock("@/lib/db", () => ({ ensureDb: vi.fn(async () => true) }));
vi.mock("@/lib/account-erasure", () => ({ requestAccountErasure: mocks.request }));
vi.mock("@/lib/auth", () => ({ clearAuthCookie: mocks.authCookie }));
vi.mock("@/lib/session-claim", () => ({ clearSessionClaimCookie: mocks.claimCookie }));
vi.mock("@/lib/require-auth", () => ({ requireUserAuth: vi.fn(async () => ({ sub: "account-a" })) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimitKey: vi.fn(() => "test"), checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
import { DELETE } from "@/app/api/user/delete/route";
import { callBotAdmin } from "@/lib/telegram/bot-admin-client";

const request = (confirmPhrase = "УДАЛИТЬ") => new NextRequest("http://localhost/api/user/delete", {
  method: "DELETE", body: JSON.stringify({ confirmPhrase }),
});

describe("durable account erasure acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.request.mockResolvedValue({ operationId: "operation-a", pending: true });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("bot offline"); }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("returns accepted, not completed, and logs out only after durable intent exists", async () => {
    const response = await DELETE(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true, pending: true, operationId: "operation-a" });
    expect(mocks.request).toHaveBeenCalledWith("account-a");
    expect(mocks.authCookie).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps auth if durable acceptance fails", async () => {
    mocks.request.mockRejectedValue(new Error("db offline"));
    expect((await DELETE(request())).status).toBe(503);
    expect(mocks.authCookie).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation before accepting irreversible intent", async () => {
    expect((await DELETE(request(""))).status).toBe(400);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { ok: "true" }, { ok: false }])("admin rejects invalid success payload %j", async (body) => {
    vi.stubEnv("BOT_INTERNAL_BASE_URL", "http://bot.internal");
    vi.stubEnv("BOT_INTERNAL_SECRET", "test-secret");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    expect((await callBotAdmin("begin_user_erasure", { telegram_user_id: 123 })).ok).toBe(false);
  });
});
