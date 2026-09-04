import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/user/register/route";
import { queryClient } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  ensureDb: vi.fn(async () => true),
  queryClient: vi.fn(),
  withTransaction: vi.fn(async (fn) => fn({})),
}));
vi.mock("@/lib/accounts", () => ({ findUserByEmail: vi.fn(async () => null) }));
vi.mock("@/lib/auth", () => ({ hashPassword: vi.fn(async () => "test-hash"), setAuthCookie: vi.fn(), normalizeAuthEmail: (s: string) => s }));
vi.mock("@/lib/api-guards", () => ({ clientIp: () => "127.0.0.1", enforceRegisterRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/recaptcha-guard", () => ({ enforceRecaptchaScope: vi.fn(async () => null) }));
vi.mock("@/lib/rune-service", () => ({ grantStarterRunesIfNeeded: vi.fn(async () => ({ granted: 0 })) }));
vi.mock("@/lib/users", () => ({ linkSessionToUser: vi.fn(), serializeUserProfile: (p: unknown) => p }));
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
  });
});
