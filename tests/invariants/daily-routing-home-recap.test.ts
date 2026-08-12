import { describe, expect, it } from "vitest";
import { claimGuestResumeSession } from "@/lib/guest-triplet-receipt-db";
import { resolveCurrentDailyCards } from "@/lib/current-daily-cards";
import {
  getHomeRecapHiddenKey,
  setHomeRecapHiddenKey,
  buildHomeRecapKey,
} from "@/lib/home-recap";
import { profileHasGuestIntroLifetimeFlag } from "@/lib/rate-limit-anchors";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { deleteConsultationSession } from "@/lib/session";
import { query } from "@/lib/db";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser, issueGuestReceipt, SAMPLE_SYMBOLS } from "./db/fixtures";
import { createHistoryEntry } from "@/lib/users";
import { recordTripletDrawAnchor } from "@/lib/users";
import { tarotCardsKey } from "@/lib/tarot";

describe.skipIf(!hasTestDb)("daily routing + home recap (db)", () => {
  installDbLifecycle();

  it("TEST1: guest intro claim does not create current daily artifact", async () => {
    const user = await createTestUser();
    const issued = await issueGuestReceipt();
    const claim = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: user.id,
    });
    expect(claim.ok).toBe(true);

    const daily = await resolveCurrentDailyCards(user.id);
    expect(daily.exists).toBe(false);
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(true);
  });

  it("TEST2: authenticated triplet history + anchor → current daily exists", async () => {
    const user = await createTestUser();
    const cards = SAMPLE_SYMBOLS.map((s) => ({ name: s.name, reversed: s.reversed }));
    const history = await createHistoryEntry({
      userId: user.id,
      characterName: "triplet",
      contextData: {
        type: "daily_triplet",
        spreadType: "daily",
        tarotCards: cards,
        masterId: "veronika",
        deckSystem: "tarot-veronika",
      },
    });
    const { rows } = await query<{ created_at: Date }>(
      `SELECT created_at FROM history WHERE id = $1`,
      [history.id]
    );
    await recordTripletDrawAnchor(user.id, rows[0]!.created_at);

    const daily = await resolveCurrentDailyCards(user.id);
    expect(daily.exists).toBe(true);
    if (!daily.exists) return;
    expect(daily.historyId).toBe(history.id);
    expect(daily.cardNames).toEqual(cards.map((c) => c.name));
    expect(daily.cardsKey).toBe(tarotCardsKey(cards));
  });

  it("TEST6: legacy lastTripletDrawAt without daily artifact → exists false", async () => {
    const user = await createTestUser();
    // Simulate pre-separation guest claim that stamped daily cooldown only.
    await recordTripletDrawAnchor(user.id, new Date().toISOString());
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(false);
    const daily = await resolveCurrentDailyCards(user.id);
    expect(daily.exists).toBe(false);
  });

  it("TEST10/11: hide home key does not wipe history or intro entitlement", async () => {
    const user = await createTestUser();
    const issued = await issueGuestReceipt();
    const claim = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: user.id,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    const cardsKey = tarotCardsKey(
      SAMPLE_SYMBOLS.map((s) => ({ name: s.name }))
    );
    const hiddenKey = buildHomeRecapKey({ source: "guest_intro", cardsKey });
    await setHomeRecapHiddenKey(user.id, hiddenKey);
    expect(await getHomeRecapHiddenKey(user.id)).toBe(hiddenKey);
    expect(await profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);

    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM sessions WHERE id = $1`,
      [claim.sessionId]
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(1);

    const second = await issueGuestReceipt({
      symbols: [
        { id: 3, name: "Императрица", position: 0, reversed: false },
        { id: 4, name: "Император", position: 1, reversed: false },
        { id: 5, name: "Жрец", position: 2, reversed: true },
      ],
    });
    const blocked = await claimGuestResumeSession({
      token: second.token,
      profileUserId: user.id,
    });
    expect(blocked.ok).toBe(false);
  });

  it("TEST14/15: guest intro delete is fail-closed then success", async () => {
    const user = await createTestUser();
    const issued = await issueGuestReceipt();
    const claim = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: user.id,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    // Marker already set by claim — delete must succeed and keep entitlement.
    const deleted = await deleteConsultationSession(claim.sessionId, user.id);
    expect(deleted).toBe(true);
    expect(await profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);

    const { rows } = await query<{ id: string }>(
      `SELECT id FROM sessions WHERE id = $1`,
      [claim.sessionId]
    );
    expect(rows).toHaveLength(0);
  });
});
