import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit-anchors", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit-anchors")>(
    "@/lib/rate-limit-anchors"
  );
  return {
    ...actual,
    profileHasGuestIntroLifetimeFlag: vi.fn(actual.profileHasGuestIntroLifetimeFlag),
  };
});

import { profileHasGuestIntroLifetimeFlag } from "@/lib/rate-limit-anchors";
import { deleteConsultationSession } from "@/lib/session";
import { claimGuestResumeSession } from "@/lib/guest-triplet-receipt-db";
import { query } from "@/lib/db";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser, issueGuestReceipt, GUEST_PRIMARY_BINDING } from "./db/fixtures";

describe.skipIf(!hasTestDb)("guest intro delete fail-closed (db)", () => {
  installDbLifecycle();

  beforeEach(() => {
    vi.mocked(profileHasGuestIntroLifetimeFlag).mockReset();
    vi.mocked(profileHasGuestIntroLifetimeFlag).mockImplementation(async (userId, client) => {
      const actual = await vi.importActual<typeof import("@/lib/rate-limit-anchors")>(
        "@/lib/rate-limit-anchors"
      );
      return actual.profileHasGuestIntroLifetimeFlag(userId, client);
    });
  });

  it("TEST14: marker check fails → session remains", async () => {
    const user = await createTestUser();
    const issued = await issueGuestReceipt();
    const claim = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: user.id,
      ...GUEST_PRIMARY_BINDING,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    vi.mocked(profileHasGuestIntroLifetimeFlag).mockResolvedValue(false);

    const deleted = await deleteConsultationSession(claim.sessionId, user.id);
    expect(deleted).toBe(false);

    const { rows } = await query<{ id: string }>(`SELECT id FROM sessions WHERE id = $1`, [
      claim.sessionId,
    ]);
    expect(rows).toHaveLength(1);
  });

  it("TEST15: marker ok → session deleted and entitlement remains", async () => {
    const user = await createTestUser();
    const issued = await issueGuestReceipt();
    const claim = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: user.id,
      ...GUEST_PRIMARY_BINDING,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    const deleted = await deleteConsultationSession(claim.sessionId, user.id);
    expect(deleted).toBe(true);

    const { rows } = await query<{ id: string }>(`SELECT id FROM sessions WHERE id = $1`, [
      claim.sessionId,
    ]);
    expect(rows).toHaveLength(0);

    const actual = await vi.importActual<typeof import("@/lib/rate-limit-anchors")>(
      "@/lib/rate-limit-anchors"
    );
    expect(await actual.profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);
  });
});
