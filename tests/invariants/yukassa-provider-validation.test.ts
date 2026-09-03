import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/settings", () => ({ getSetting: vi.fn() }));
import { fetchYukassaPayment, verifyYukassaWebhookPayment } from "@/lib/yukassa";

const ID = "2419a771-000f-5000-9000-1edaf29243f2";
const fetchMock = vi.fn();
const payment = { id: ID, status: "succeeded", paid: true, amount: { value: "199.00", currency: "RUB" }, metadata: { type: "rune_purchase" } };
describe("provider payment validation", () => {
  beforeEach(() => {
    vi.stubEnv("YUKASSA_SHOP_ID", "test-shop");
    vi.stubEnv("YUKASSA_SECRET_KEY", "test-only");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => payment });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("rejects a malformed identifier before provider lookup", async () => {
    expect(await fetchYukassaPayment("not-a-payment-id")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires the provider response to identify the requested payment", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...payment, id: "2419a771-000f-5000-9000-1edaf29243f3" }) });
    expect(await fetchYukassaPayment(ID)).toBeNull();
  });
  it.each([
    { paid: false },
    { status: "pending" },
    { amount: { value: "199.00", currency: "USD" } },
    { amount: { value: "invalid", currency: "RUB" } },
    { amount: { value: "0", currency: "RUB" } },
  ])("rejects an unconfirmed or invalid settlement: %j", async (override) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...payment, ...override }) });
    expect(await verifyYukassaWebhookPayment(ID, "payment.succeeded")).toEqual({ valid: false });
  });
  it("returns the canonical provider identity and settled amount", async () => {
    expect(await verifyYukassaWebhookPayment(ID, "payment.succeeded")).toEqual({ valid: true, paymentId: ID, amountRub: 199, metadata: payment.metadata });
  });
});
