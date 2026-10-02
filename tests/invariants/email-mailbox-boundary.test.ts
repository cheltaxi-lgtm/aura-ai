import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeSingleMailbox } from "@/lib/email/mailbox";
import { isDeliverableUserEmail, pickDeliverableEmail } from "@/lib/email/mail-config";
import { deliverEmail } from "@/lib/email/transport";

const smtp = vi.hoisted(() => ({ send: vi.fn(async () => ({})), create: vi.fn() }));
vi.mock("nodemailer", () => ({ createTransport: smtp.create }));
const invalid = [
  "x".repeat(42_000) + "@example.com", "(".repeat(20_000) + "@example.com",
  "Name <user@example.com>", "user(comment)@example.com", '"user"@example.com',
  "a@example.com,b@example.com", "a@example.com; b@example.com", "a@b@example.com",
  "user@example.com\r\nBcc: other@example.com", "user\u0000@example.com",
  ".user@example.com", "user..name@example.com", "user.@example.com",
  "x".repeat(65) + "@example.com", "user@" + "x".repeat(64) + ".com",
  "user@-example.com", "user@example..com", "user@example.com.",
  "user@127.1", ["user@example.com"], { address: "user@example.com" }, null, 123,
];

describe("single mailbox security boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SMTP_USER", "test@example.com");
    vi.stubEnv("SMTP_PASS", "test-only");
    vi.stubEnv("RESEND_API_KEY", "");
    smtp.create.mockReturnValue({ sendMail: smtp.send });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("accepts normal addresses, IDN domains and the SMTP length boundary", () => {
    expect(normalizeSingleMailbox("  User.Name+tag@Example.COM  ")).toBe("user.name+tag@example.com");
    expect(normalizeSingleMailbox("user@почта.рф")).toBe("user@xn--80a1acny.xn--p1ai");
    const max = "x".repeat(64) + "@" + "a".repeat(63) + "." + "b".repeat(63) + "." + "c".repeat(61);
    expect(max.length).toBe(254);
    expect(normalizeSingleMailbox(max)).toBe(max);
    expect(normalizeSingleMailbox(max + "c")).toBeNull();
  });
  it("rejects malformed recipients before either provider or fallback runs", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    vi.stubEnv("RESEND_API_KEY", "test-only");
    for (const to of invalid) {
      expect(normalizeSingleMailbox(to)).toBeNull();
      expect(await deliverEmail({ to: to as string, subject: "Test", html: "Test" })).toMatchObject({ ok: false, provider: "none", error: "invalid_mailbox" });
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(smtp.create).not.toHaveBeenCalled();
    expect(smtp.send).not.toHaveBeenCalled();
  });
  it("blocks an unsafe reply-to even when the recipient is valid", async () => {
    expect(await deliverEmail({ to: "user@example.com", replyTo: "Name <other@example.com>", subject: "Test", html: "Test" }, "smtp")).toMatchObject({ ok: false, error: "invalid_mailbox" });
    expect(smtp.create).not.toHaveBeenCalled();
  });
  it("keeps valid SMTP delivery available with normalized mailbox fields", async () => {
    expect(await deliverEmail({ to: " User@Example.COM ", replyTo: "Support@Example.COM", subject: "Test", html: "Test" }, "smtp")).toMatchObject({ ok: true, provider: "smtp" });
    expect(smtp.send).toHaveBeenCalledWith(expect.objectContaining({ to: "user@example.com", replyTo: "support@example.com" }));
  });
  it("retains placeholder exclusions and skips malformed historical candidates", () => {
    expect(isDeliverableUserEmail("tg_1@telegram.zovus.local")).toBe(false);
    expect(isDeliverableUserEmail("vk_1@oauth.zovus.local")).toBe(false);
    expect(isDeliverableUserEmail("user@example.com")).toBe(true);
    expect(pickDeliverableEmail(invalid[0] as string, "Name <user@example.com>", " User@Example.COM ")).toBe("user@example.com");
  });
});
