import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureDb: vi.fn(), query: vi.fn(), queryClient: vi.fn(), withTransaction: vi.fn(), auth: vi.fn(), profile: vi.fn(), profileAuth: vi.fn(),
  getReminder: vi.fn(), setReminder: vi.fn(), updatePrefs: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  ensureDb: mocks.ensureDb,
  query: mocks.query,
  queryClient: mocks.queryClient,
  withTransaction: mocks.withTransaction,
}));
vi.mock("@/lib/require-auth", () => ({ requireUserAuth: mocks.auth, requireProfileUserId: mocks.profileAuth }));
vi.mock("@/lib/accounts", () => ({
  getAccountDailyCardsReminder: mocks.getReminder,
  setAccountDailyCardsReminder: mocks.setReminder,
  getProfileUserIdForAccount: mocks.profile,
}));
vi.mock("@/lib/daily-reminder-service", () => ({ updateNotificationPrefs: mocks.updatePrefs }));

import { PATCH } from "@/app/api/auth/daily-cards-reminder/route";
import { PATCH as patchNotificationPrefs } from "@/app/api/profile/notifications/route";

function request(body: unknown) {
  return new NextRequest("https://zovus.ru/api/auth/daily-cards-reminder", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureDb.mockResolvedValue(true);
  mocks.auth.mockResolvedValue({ sub: "account" });
  mocks.profileAuth.mockResolvedValue({ auth: { sub: "account" }, profileUserId: "profile" });
  mocks.query.mockResolvedValue({ rows: [{ linked: true }] });
  mocks.profile.mockResolvedValue("profile");
  mocks.getReminder.mockResolvedValue(true);
  mocks.setReminder.mockResolvedValue(true);
  mocks.updatePrefs.mockResolvedValue({});
  mocks.withTransaction.mockImplementation(async (fn) => fn({}));
  mocks.queryClient.mockImplementation(async (_client, sql: string) => {
    if (sql.includes("FROM user_accounts ua")) {
      return { rows: [{ profile_user_id: "profile", daily_cards_reminder: true }] };
    }
    if (sql.includes("FROM user_telegram_identities")) return { rows: [{ linked: true }] };
    return { rows: [] };
  });
});

it("rejects a direct Telegram preference write for an unlinked account", async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  const response = await patchNotificationPrefs(new NextRequest("https://zovus.ru/api/profile/notifications", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dailyTelegram: true }),
  }));
  expect(response.status).toBe(409);
  expect(mocks.updatePrefs).not.toHaveBeenCalled();
});

describe("daily Telegram reminder opt-in", () => {
  it("changes only Telegram when other reminder channels are already enabled", async () => {
    const response = await PATCH(request({ dailyCardsReminder: true, channel: "telegram" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ dailyTelegramReminder: true });
    expect(mocks.withTransaction).toHaveBeenCalledOnce();
    expect(mocks.queryClient.mock.calls[0][2]).toEqual(["account"]);
    expect(mocks.queryClient.mock.calls[0][1]).toContain("FOR UPDATE");
    expect(mocks.queryClient.mock.calls[1][1]).toContain("FROM user_telegram_identities");
    const patch = JSON.parse(mocks.queryClient.mock.calls[2][2][1]);
    expect(patch).toEqual({ dailyTelegram: true });
    expect(mocks.queryClient.mock.calls[3][1]).toContain("daily_cards_reminder=TRUE");
  });

  it("keeps email and in-app off when Telegram reopens a previously unsubscribed reminder", async () => {
    mocks.queryClient.mockImplementation(async (_client, sql: string) => {
      if (sql.includes("FROM user_accounts ua")) {
        return { rows: [{ profile_user_id: "profile", daily_cards_reminder: false }] };
      }
      if (sql.includes("FROM user_telegram_identities")) return { rows: [{ linked: true }] };
      return { rows: [] };
    });
    const response = await PATCH(request({ dailyCardsReminder: true, channel: "telegram" }));
    expect(response.status).toBe(200);
    expect(JSON.parse(mocks.queryClient.mock.calls[2][2][1])).toEqual({
      dailyTelegram: true, dailyEmail: false, dailyInApp: false,
    });
  });

  it("rejects an unlinked account before changing any preference", async () => {
    mocks.queryClient.mockResolvedValueOnce({ rows: [
      { profile_user_id: "profile", daily_cards_reminder: false },
    ] }).mockResolvedValueOnce({ rows: [] });
    expect((await PATCH(request({ dailyCardsReminder: true, channel: "telegram" }))).status).toBe(409);
    expect(mocks.queryClient).toHaveBeenCalledTimes(2);
  });

  it("does not commit a channel preference if reopening the master reminder fails", async () => {
    const written: string[] = [];
    let committed = false;
    mocks.withTransaction.mockImplementation(async (fn) => {
      await fn({});
      committed = true;
    });
    mocks.queryClient.mockImplementation(async (_client, sql: string) => {
      if (sql.includes("FROM user_accounts ua")) {
        return { rows: [{ profile_user_id: "profile", daily_cards_reminder: false }] };
      }
      if (sql.includes("FROM user_telegram_identities")) return { rows: [{ linked: true }] };
      if (sql.includes("UPDATE user_accounts")) throw new Error("database write failed");
      written.push(sql);
      return { rows: [] };
    });
    await expect(PATCH(request({ dailyCardsReminder: true, channel: "telegram" }))).rejects.toThrow("database write failed");
    expect(written).toHaveLength(1);
    expect(committed).toBe(false);
  });

  it("turns off Telegram without switching off other reminder channels", async () => {
    const response = await PATCH(request({ dailyCardsReminder: false, channel: "telegram" }));
    expect(response.status).toBe(200);
    expect(JSON.parse(mocks.queryClient.mock.calls[1][2][1])).toEqual({ dailyTelegram: false });
    expect(mocks.queryClient).toHaveBeenCalledTimes(2);
  });

  it("preserves the original email/in-app toggle and rejects unknown channels", async () => {
    expect((await PATCH(request({ dailyCardsReminder: true }))).status).toBe(200);
    expect(mocks.updatePrefs).toHaveBeenCalledWith("profile", { dailyEmail: true, dailyInApp: true });
    expect((await PATCH(request({ dailyCardsReminder: true, channel: "sms" }))).status).toBe(400);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });
});
