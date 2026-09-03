import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  credit: vi.fn(),
  complete: vi.fn(),
  influencer: vi.fn(),
}));
vi.mock("@/lib/yukassa", () => ({
  isYukassaConfigured: () => true,
  verifyYukassaWebhookPayment: mocks.verify,
}));
vi.mock("@/lib/rune-service", () => ({ creditRunesFromPaymentDetailed: mocks.credit }));
vi.mock("@/lib/session", () => ({ completePayment: mocks.complete }));
vi.mock("@/lib/influencers", () => ({ creditInfluencerBalance: mocks.influencer }));

import { processYukassaWebhook } from "@/lib/yukassa-webhook";

describe("YooKassa webhook metadata authority", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.credit.mockResolvedValue("credited");
    mocks.complete.mockResolvedValue(null);
  });

  it.each([undefined, { session_id: "owned-session", plan: "single" }])(
    "never turns a verified session payment into a rune purchase using request metadata: %j",
    async (metadata) => {
      mocks.verify.mockResolvedValue({ valid: true, paymentId: "verified-payment", amountRub: 199, metadata });
      await processYukassaWebhook({
        event: "payment.succeeded",
        object: {
          id: "verified-payment",
          metadata: { type: "rune_purchase", userId: "other-user", packageId: "large", priceRub: "199" },
        },
      });
      expect(mocks.credit).not.toHaveBeenCalled();
      expect(mocks.complete).toHaveBeenCalledWith("verified-payment", 199);
    }
  );

  it("credits a legitimate rune purchase using only provider metadata", async () => {
    mocks.verify.mockResolvedValue({
      valid: true,
      paymentId: "verified-payment",
      amountRub: 499,
      metadata: { type: "rune_purchase", userId: "owner", packageId: "standard", priceRub: "499" },
    });
    const result = await processYukassaWebhook({
      event: "payment.succeeded",
      object: { id: "verified-payment", metadata: { userId: "other-user", priceRub: "1" } },
    });
    expect(result.kind).toBe("rune_credited");
    expect(mocks.credit).toHaveBeenCalledWith({
      userId: "owner", packageId: "standard", paymentId: "verified-payment", amountRub: 499, expectedPriceRub: 499,
    });
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
