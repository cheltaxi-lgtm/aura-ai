import { afterEach, describe, expect, it, vi } from "vitest";
import { createYukassaRunePayment } from "@/lib/yukassa";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("YooKassa rune payment idempotence", () => {
  it("uses a stable key within YooKassa's 64-character limit", async () => {
    vi.stubEnv("YUKASSA_SHOP_ID", "test-shop");
    vi.stubEnv("YUKASSA_SECRET_KEY", "test-secret");
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ id: "payment-test", status: "pending" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const params = {
      requestId: "11111111-1111-4111-8111-111111111111",
      packageId: "package-with-a-long-identifier",
      packageName: "Test package",
      priceRub: 249,
      totalRunes: 25,
      userId: "22222222-2222-4222-8222-222222222222",
      appUrl: "https://example.invalid",
    };

    await createYukassaRunePayment(params);
    await createYukassaRunePayment(params);
    await createYukassaRunePayment({ ...params, requestId: "33333333-3333-4333-8333-333333333333" });
    await createYukassaRunePayment({ ...params, userId: "44444444-4444-4444-8444-444444444444" });

    const keys = fetchMock.mock.calls.map((call) =>
      new Headers((call[1] as RequestInit).headers).get("Idempotence-Key")
    );
    expect(keys).toHaveLength(4);
    expect(keys[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[0]);
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string).metadata.orderId)
      .toBe(params.requestId);
  });
});
