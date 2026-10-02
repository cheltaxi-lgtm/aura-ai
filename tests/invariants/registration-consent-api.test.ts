import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/user/register/route";
import { queryClient } from "@/lib/db";
import { findUserByEmail } from "@/lib/accounts";
import { hashPassword, setAuthCookie } from "@/lib/auth";

vi.mock("@/lib/db", () => ({
  ensureDb: vi.fn(async () => true),
  queryClient: vi.fn(),
  withTransaction: vi.fn(async (fn) => fn({})),
}));
vi.mock("@/lib/accounts", () => ({ findUserByEmail: vi.fn(async () => null) }));
vi.mock("@/lib/auth", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/auth")>(), hashPassword: vi.fn(async () => "test-hash"), setAuthCookie: vi.fn() }));
vi.mock("@/lib/api-guards", () => ({ clientIp: () => "127.0.0.1", enforceRegisterRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/recaptcha-guard", () => ({ enforceRecaptchaScope: vi.fn(async () => null) }));
vi.mock("@/lib/rune-service", () => ({ grantStarterRunesIfNeeded: vi.fn(async () => ({ granted: 0 })) }));
vi.mock("@/lib/users", () => ({
  linkSessionToUser: vi.fn(),
  serializeUserProfile: (p: unknown) => p,
  normalizeProfileMainQuestion: (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null,
}));
vi.mock("@/lib/email/send", () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock("@/lib/session-claim", () => ({ readSessionClaimCookie: vi.fn() }));

describe("email registration consent API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(queryClient).mockImplementation(async (_client, sql) => ({
      rows: String(sql).includes("INSERT INTO user_accounts")
        ? [{ id: "account", email: "test@example.test", name: "Тест" }]
        : String(sql).includes("INSERT INTO users") ? [{ id: "profile", birth_date: null }] : [],
      rowCount: 1,
    }) as never);
  });

  it.each([true, false, undefined, "true", 1, null])("stores only explicit boolean opt-in (%s)", async (marketingConsent) => {
    const response = await POST(new NextRequest("http://localhost/api/auth/user/register", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.test", password: "Test-password-123!", name: "Тест", acceptedTerms: true, ageConfirmed: true, marketingConsent }),
    }));
    expect(response.status).toBe(200);
    const insert = vi.mocked(queryClient).mock.calls.find((call) => String(call[1]).includes("INSERT INTO user_accounts"));
    expect(insert).toBeDefined();
    expect(insert![2]![5]).toBe(marketingConsent === true);
    if (marketingConsent === true) expect(insert![2]![6]).toEqual(expect.any(String));
    else expect(insert![2]![6]).toBeNull();
    const channelUpdate = vi.mocked(queryClient).mock.calls.find((call) =>
      String(call[1]).includes("SET notification_prefs") &&
      String(call[1]).includes("marketingEmail")
    );
    expect(Boolean(channelUpdate)).toBe(marketingConsent === true);
  });
  it.each([
    "x".repeat(42_000) + "@example.com", "Name <test@example.com>",
    "test(comment)@example.com", "a@example.com,b@example.com",
    "test@example.com\r\nBcc: other@example.com", ["test@example.com"],
    { address: "test@example.com" }, 123, "vk_1@oauth.zovus.local", "tg_1@telegram.zovus.local",
  ])("rejects a malformed mailbox before auth lookup, password hashing or writes (%#)", async email => {
    const response = await POST(new NextRequest("http://localhost/api/auth/user/register", {
      method: "POST", body: JSON.stringify({ email, password: "Test-password-123!", name: "Тест", acceptedTerms: true, ageConfirmed: true }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Укажите корректный email" });
    expect(findUserByEmail).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(queryClient).not.toHaveBeenCalled();
    expect(setAuthCookie).not.toHaveBeenCalled();
  });
  it("keeps IDN registration on the same account key as login and reset", async () => {
    const response = await POST(new NextRequest("http://localhost/api/auth/user/register", {
      method: "POST", body: JSON.stringify({ email: " User@почта.рф ", password: "Test-password-123!", name: "Тест", acceptedTerms: true, ageConfirmed: true }),
    }));
    expect(response.status).toBe(200);
    expect(findUserByEmail).toHaveBeenCalledWith("user@почта.рф");
    const insert = vi.mocked(queryClient).mock.calls.find(call => String(call[1]).includes("INSERT INTO user_accounts"));
    expect(insert![2]![0]).toBe("user@почта.рф");
  });
});
