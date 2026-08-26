import { describe, expect, it } from "vitest";
import { claimGuestResumeSession, profileHasUsedGuestResume } from "@/lib/guest-triplet-receipt-db";
import {
  profileHasGuestIntroLifetimeFlag,
  recordGuestIntroUsed,
} from "@/lib/rate-limit-anchors";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { resetTripletCooldown } from "@/lib/users";
import { deleteConsultationSession } from "@/lib/session";
import { purgeUserCabinetData } from "@/lib/cabinet-data";
import { query } from "@/lib/db";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser, issueGuestReceipt, GUEST_PRIMARY_BINDING } from "./db/fixtures";

function claimIssued(token: string, profileUserId: string) {
  return claimGuestResumeSession({
    token,
    profileUserId,
    ...GUEST_PRIMARY_BINDING,
  });
}

describe.skipIf(!hasTestDb)("guest-intro-lifetime (db)", () => {
  installDbLifecycle();

  it("TEST1: first guest receipt + new profile → claim success", async () => {
    const issued = await issueGuestReceipt();
    const user = await createTestUser();
    const claim = await claimIssued(issued.token, user.id);
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    expect(claim.alreadyClaimed).toBe(false);
    expect(await profileHasUsedGuestResume(user.id)).toBe(true);
    expect(await profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);
  });

  it("TEST2: same profile + second receipt → already_used", async () => {
    const user = await createTestUser();
    const first = await issueGuestReceipt();
    const claim1 = await claimIssued(first.token, user.id);
    expect(claim1.ok).toBe(true);

    const second = await issueGuestReceipt({
      symbols: [
        { id: 10, name: "Колесо Фортуны", position: 0, reversed: false },
        { id: 11, name: "Справедливость", position: 1, reversed: true },
        { id: 12, name: "Повешенный", position: 2, reversed: false },
      ],
    });
    const claim2 = await claimIssued(second.token, user.id);
    expect(claim2.ok).toBe(false);
    if (claim2.ok) return;
    expect(claim2.code).toBe("already_used");
  });

  it("TEST3: history/cabinet purge still rejects second intro", async () => {
    const user = await createTestUser();
    const first = await issueGuestReceipt({
      question: "Секретный вопрос для privacy purge",
    });
    const claim1 = await claimIssued(first.token, user.id);
    expect(claim1.ok).toBe(true);
    if (!claim1.ok) return;

    const before = await query<{ cards: unknown }>(
      `SELECT cards FROM sessions WHERE id = $1`,
      [claim1.sessionId]
    );
    expect(JSON.stringify(before.rows[0]?.cards ?? "")).toContain("Шут");

    await purgeUserCabinetData(user.id);
    expect(await profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);
    expect(await profileHasUsedGuestResume(user.id)).toBe(true);

    const after = await query<{ id: string; cards: unknown }>(
      `SELECT id, cards FROM sessions WHERE id = $1`,
      [claim1.sessionId]
    );
    expect(after.rows).toHaveLength(0);

    const leaked = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM sessions
       WHERE user_id = $1
         AND (
           cards::text ILIKE '%Секретный вопрос%'
           OR cards::text ILIKE '%Шут%'
           OR guest_resume_token_hash IS NOT NULL
           OR guest_resume_fingerprint IS NOT NULL
         )`,
      [user.id]
    );
    expect(Number(leaked.rows[0]?.n ?? 0)).toBe(0);

    const second = await issueGuestReceipt();
    const claim2 = await claimIssued(second.token, user.id);
    expect(claim2.ok).toBe(false);
    if (claim2.ok) return;
    expect(claim2.code).toBe("already_used");
  });

  it("TEST4: new browser receipt after login still rejected (lifetime flag)", async () => {
    const user = await createTestUser();
    await recordGuestIntroUsed(user.id, "2024-01-01T00:00:00.000Z");
    expect(await profileHasUsedGuestResume(user.id)).toBe(true);

    const issued = await issueGuestReceipt();
    const claim = await claimIssued(issued.token, user.id);
    expect(claim.ok).toBe(false);
    if (claim.ok) return;
    expect(claim.code).toBe("already_used");
  });

  it("TEST5: parallel claims → only one first entitlement", async () => {
    const user = await createTestUser();
    const a = await issueGuestReceipt();
    const b = await issueGuestReceipt({
      symbols: [
        { id: 20, name: "Суд", position: 0, reversed: false },
        { id: 21, name: "Мир", position: 1, reversed: false },
        { id: 0, name: "Шут", position: 2, reversed: true },
      ],
    });

    const [r1, r2] = await Promise.all([
      claimIssued(a.token, user.id),
      claimIssued(b.token, user.id),
    ]);

    const oks = [r1, r2].filter((r) => r.ok);
    const fails = [r1, r2].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(fails).toHaveLength(1);
    if (!fails[0].ok) expect(fails[0].code).toBe("already_used");
  });

  it("TEST7: daily cooldown reset does not restore intro", async () => {
    const user = await createTestUser();
    const issued = await issueGuestReceipt();
    const claim = await claimIssued(issued.token, user.id);
    expect(claim.ok).toBe(true);

    await resetTripletCooldown(user.id);
    expect(await profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);

    const second = await issueGuestReceipt();
    const blocked = await claimIssued(second.token, user.id);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.code).toBe("already_used");
  });

  it("TEST8: client flags alone never grant intro (server gate)", async () => {
    const user = await createTestUser();
    // Simulate client-only "guestResume/isFree" noise — server has no sessions/flag.
    expect(await profileHasUsedGuestResume(user.id)).toBe(false);
    const issued = await issueGuestReceipt();
    const claim = await claimIssued(issued.token, user.id);
    expect(claim.ok).toBe(true);
  });

  it("TEST12/13: daily cooldown and intro lifetime are independent", async () => {
    const user = await createTestUser();
    const issued = await issueGuestReceipt();
    const claim = await claimIssued(issued.token, user.id);
    expect(claim.ok).toBe(true);

    // Intro must not consume daily triplet slot.
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(true);

    // Daily usage must not clear intro lifetime.
    await query(
      `UPDATE users SET astro_meta = jsonb_set(
         COALESCE(astro_meta, '{}'::jsonb),
         '{lastDailyTripletDrawAt}',
         to_jsonb($2::text),
         true
       ) WHERE id = $1`,
      [user.id, new Date().toISOString()]
    );
    expect(await profileHasUsedGuestResume(user.id)).toBe(true);
    const afterDaily = await checkTripletCooldown(user.id);
    expect(afterDaily.allowed).toBe(false);
  });

  it("single session delete removes personal payload and keeps lifetime gate", async () => {
    const user = await createTestUser();
    const issued = await issueGuestReceipt({
      question: "Вопрос для удаления сессии",
    });
    const claim = await claimIssued(issued.token, user.id);
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    await deleteConsultationSession(claim.sessionId, user.id);
    expect(await profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);

    const { rows } = await query<{ id: string }>(
      `SELECT id FROM sessions WHERE id = $1`,
      [claim.sessionId]
    );
    expect(rows).toHaveLength(0);

    const second = await issueGuestReceipt();
    const blocked = await claimIssued(second.token, user.id);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.code).toBe("already_used");
  });
});
