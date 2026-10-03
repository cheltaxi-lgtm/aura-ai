import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ charge: vi.fn() }));
vi.mock("@/lib/db", () => ({ ensureDb: async () => true }));
vi.mock("@/lib/require-auth", () => ({ resolveProfileUserContext: async () => ({ ok: true, auth: { sub: "account" }, profileUserId: "profile" }) }));
vi.mock("@/lib/api-guards", () => ({ enforcePaidRouteRateLimit: async () => null }));
vi.mock("@/lib/async-job-worker-auth", () => ({ getAsyncJobWorkerUserId: () => null, getAsyncJobIdFromRequest: () => null, isAsyncJobWorkerConfigured: () => false }));
vi.mock("@/lib/reading-lock", () => ({ withReadingLock: async (_key: string, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/spread-catalog-loader", () => ({ ensureSpreadCatalogSettingsLoaded: async () => {} }));
vi.mock("@/lib/users", () => ({ getUserById: async () => ({ name: "Synthetic", birth_date: "1990-01-01" }) }));
vi.mock("@/lib/accounts", () => ({ resolveUnlimitedAccess: async () => false, getUserReadingHistory: async () => [], findCachedIntentionSpread: () => null }));
vi.mock("@/lib/chat-sanitize", () => ({ resolveApiCharacterId: async (id: string) => id || "veronika", sanitizeTextField: (text: string) => typeof text === "string" ? text.trim() : null }));
vi.mock("@/lib/rune-settings", () => ({ getRuneSettings: async () => ({ enabled: true }) }));
vi.mock("@/lib/rune-service", () => ({ isRuneBillingActive: () => true, getRuneBalance: async () => 100 }));
vi.mock("@/lib/services/billing-service", () => ({
  BillingService: { chargeForSession: m.charge },
  InsufficientFundsError: class extends Error {}, BillingIdempotencyConflictError: class extends Error {},
  insufficientFundsResponse: () => NextResponse.json({ error: "fixture_charge_boundary" }, { status: 402 }),
  billingIdempotencyConflictResponse: () => NextResponse.json({ error: "fixture_conflict" }, { status: 409 }),
  CHARGE_IDEM_WINDOW_SEC: 30,
  readRequestChargeIdempotencyKey: (req: NextRequest, body: { idempotencyKey?: string }) => req.headers.get("Idempotency-Key") || body.idempotencyKey,
}));
vi.mock("@/lib/decks", () => ({ resolveSpreadDeckSystem: () => "tarot-veronika" }));
vi.mock("@/lib/intention-draw", () => ({ resolveSpreadSymbols: (_system: string, names: string[]) => names.map((name) => ({ name, reversed: name.startsWith("Перевёрнутая") })) }));
vi.mock("@/lib/spread-draw", () => ({ resolveSpreadSessionSeed: () => "synthetic-seed", drawSeededSessionSpread: () => ({ cards: [{ name: "Солнце" }, { name: "Маг" }, { name: "Звезда" }] }) }));
vi.mock("@/lib/spreads", () => ({ getSpread: () => ({ cardCount: 3 }), normalizeSpreadId: (id?: string) => id || "triplet", isDailyOnlySpread: () => false, isSpreadSessionAllowed: () => true,
  resolveSpreadPositions: () => [{ label: "1" }, { label: "2" }, { label: "3" }] }));
vi.mock("@/lib/spreads/spread-pricing", () => ({ resolveSpreadCost: () => 20 }));
vi.mock("@/lib/joint-reading-service", () => ({ getJointReadingByToken: async () => ({ spread_id: "triplet", status: "waiting", initiator_user_id: "profile", intent_slug: null }), jointSideAvailability: () => null }));
import { InsufficientFundsError } from "@/lib/services/billing-service";
import { POST } from "@/app/api/intention-spread/route";

const defaultBody = { characterId: "veronika", intention: "custom", customQuestion: "Как наладить отношения?", sessionId: "00000000-0000-4000-8000-000000000001", cardNames: ["Солнце", "Маг", "Звезда"] };
async function key(overrides: Record<string, unknown> = {}, header = "raw-key") {
  const request = new NextRequest("http://localhost/api/intention-spread", { method: "POST", headers: { "Idempotency-Key": header }, body: JSON.stringify({ ...defaultBody, ...overrides }) });
  expect((await POST(request)).status).toBe(402);
  return m.charge.mock.calls.at(-1)![0].idempotencyKey as string;
}

describe("actual intention route binds payment to accepted payload", () => {
  beforeEach(() => { vi.clearAllMocks(); m.charge.mockRejectedValue(new InsufficientFundsError()); });
  it("changed client key for one session and payload retains the server purchase", async () => {
    expect(await key({}, "first-client-key")).toBe(await key({}, "other-client-key"));
  });
  it.each([
    { customQuestion: "Как изменить работу?" }, { characterId: "evelina" },
    { cardNames: ["Маг", "Солнце", "Звезда"] }, { sessionId: "00000000-0000-4000-8000-000000000002" },
  ])("reused raw client key cannot substitute accepted payload %j", async (changes) => {
    expect(await key(changes)).not.toBe(await key());
  });
  it("without session, a request nonce is still combined with actual question/cards", async () => {
    const first = await key({ sessionId: undefined });
    expect(await key({ sessionId: undefined, customQuestion: "Как изменить работу?" })).not.toBe(first);
    expect(await key({ sessionId: undefined })).toBe(first);
  });
  it("joint purchase includes accepted payload and is stable across client keys", async () => {
    const first = await key({ jointToken: "synthetic_joint_token" }, "one");
    expect(await key({ jointToken: "synthetic_joint_token" }, "two")).toBe(first);
    expect(await key({ jointToken: "synthetic_joint_token", customQuestion: "Как изменить работу?" })).not.toBe(first);
  });
});
