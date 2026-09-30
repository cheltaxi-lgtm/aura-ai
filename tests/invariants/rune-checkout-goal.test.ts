import { afterEach, describe, expect, it, vi } from "vitest";
import { trackRuneCheckoutStarted, trackRunePurchase } from "@/lib/seo/metrika";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("rune checkout goal", () => {
  function installMetrika() {
    const stored = new Map<string, string>();
    stored.set("aura_cookie_consent", "1");
    const send = vi.fn((_id: number, _method: string, _goal: string, _params: unknown, callback: () => void) => callback());
    vi.stubGlobal("window", { ym: send, setTimeout, clearTimeout });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
    });
    return send;
  }

  it("sends one qualified checkout goal per provider payment", async () => {
    const send = installMetrika();
    await trackRuneCheckoutStarted("payment-1", 249);
    await trackRuneCheckoutStarted("payment-1", 249);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(110138367, "reachGoal", "rune_checkout_started", expect.any(Object), expect.any(Function));
    await trackRuneCheckoutStarted("payment-2", 100);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does not count a missing payment ID or invalid amount", async () => {
    const send = installMetrika();
    await trackRuneCheckoutStarted("", 249);
    await trackRuneCheckoutStarted("payment-1", 0);
    expect(send).not.toHaveBeenCalled();
  });

  it("marks a purchase only after the Metrika callback, including a late callback", async () => {
    vi.useFakeTimers();
    const send = installMetrika();
    send.mockImplementation(() => undefined);
    const onSent = vi.fn();
    const tracking = trackRunePurchase(249, "rune-pack", onSent);
    expect(send).toHaveBeenCalledTimes(1);
    expect(onSent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await tracking).toBe(false);
    const callback = send.mock.calls[0]?.[4];
    callback?.();
    callback?.();
    expect(onSent).toHaveBeenCalledTimes(1);
  });
});
