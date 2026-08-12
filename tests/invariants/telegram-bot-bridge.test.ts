import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  assertBotInternalAuth,
  BOT_INTERNAL_SECRET_HEADER,
} from "@/lib/telegram/bot-internal-auth";
import {
  isValidLinkCode,
  LINK_CODE_HEX_LEN,
} from "@/lib/telegram/link-code-format";
import { newLinkCode } from "@/lib/telegram/link-code";
import { telegramAuthMaxAgeSec } from "@/lib/telegram/verify";
import { POST as starsCredit } from "@/app/api/internal/bot/runes/stars-credit/route";
import { POST as starsValidate } from "@/app/api/internal/bot/runes/stars-validate/route";

describe("Telegram bot bridge security", () => {
  const prevSecret = process.env.BOT_INTERNAL_SECRET;
  const prevMaxAge = process.env.TELEGRAM_AUTH_MAX_AGE_SEC;

  beforeEach(() => {
    process.env.BOT_INTERNAL_SECRET = "test-bot-internal-secret-32chars!!";
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.BOT_INTERNAL_SECRET;
    else process.env.BOT_INTERNAL_SECRET = prevSecret;
    if (prevMaxAge === undefined) delete process.env.TELEGRAM_AUTH_MAX_AGE_SEC;
    else process.env.TELEGRAM_AUTH_MAX_AGE_SEC = prevMaxAge;
    vi.restoreAllMocks();
  });

  it("rejects missing or wrong internal secret", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bare = new NextRequest("http://127.0.0.1/api/internal/bot/spread", {
      method: "POST",
    });
    expect(assertBotInternalAuth(bare)).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });

    const wrong = new NextRequest("http://127.0.0.1/api/internal/bot/spread", {
      method: "POST",
      headers: { [BOT_INTERNAL_SECRET_HEADER]: "nope" },
    });
    expect(assertBotInternalAuth(wrong).ok).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("accepts matching internal secret", () => {
    const ok = new NextRequest("http://127.0.0.1/api/internal/bot/spread", {
      method: "POST",
      headers: {
        [BOT_INTERNAL_SECRET_HEADER]: "test-bot-internal-secret-32chars!!",
      },
    });
    expect(assertBotInternalAuth(ok)).toEqual({ ok: true });
  });

  it("disables internal API when secret unset", () => {
    delete process.env.BOT_INTERNAL_SECRET;
    const req = new NextRequest("http://127.0.0.1/api/internal/bot/spread", {
      method: "POST",
    });
    expect(assertBotInternalAuth(req)).toEqual({
      ok: false,
      status: 503,
      error: "internal_bot_disabled",
    });
  });

  it("Stars credit/validate stay retired (410)", async () => {
    const credit = await starsCredit(
      new NextRequest("http://127.0.0.1/api/internal/bot/runes/stars-credit", {
        method: "POST",
      })
    );
    const validate = await starsValidate(
      new NextRequest("http://127.0.0.1/api/internal/bot/runes/stars-validate", {
        method: "POST",
      })
    );
    expect(credit.status).toBe(410);
    expect(validate.status).toBe(410);
    expect((await credit.json()).error).toBe("stars_retired");
    expect((await validate.json()).error).toBe("stars_retired");
  });

  it("mints 16-hex link codes and accepts legacy 10-hex", () => {
    const code = newLinkCode();
    expect(code).toHaveLength(LINK_CODE_HEX_LEN);
    expect(isValidLinkCode(code)).toBe(true);
    expect(isValidLinkCode("a1b2c3d4e5")).toBe(true);
    expect(isValidLinkCode("short")).toBe(false);
    expect(isValidLinkCode("g".repeat(16))).toBe(false);
  });

  it("defaults initData max age to 1 hour", () => {
    delete process.env.TELEGRAM_AUTH_MAX_AGE_SEC;
    expect(telegramAuthMaxAgeSec()).toBe(3600);
    process.env.TELEGRAM_AUTH_MAX_AGE_SEC = "7200";
    expect(telegramAuthMaxAgeSec()).toBe(7200);
  });
});
