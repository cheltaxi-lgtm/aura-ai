import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyRecaptcha } from "@/lib/recaptcha";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("reCAPTCHA response binding", () => {
  async function verify(action: string, hostname: string) {
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "test-site-key");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://zovus.ru");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ success: true, score: 0.9, action, hostname }),
    }));
    return verifyRecaptcha("test-token", "register");
  }

  it("accepts a response for the requested site and action", async () => {
    expect(await verify("register", "zovus.ru")).toMatchObject({ ok: true });
  });

  it("rejects a token issued for another action", async () => {
    expect(await verify("login", "zovus.ru")).toMatchObject({ ok: false });
  });

  it("rejects a token issued on another hostname", async () => {
    expect(await verify("register", "attacker.example")).toMatchObject({ ok: false });
  });
});
