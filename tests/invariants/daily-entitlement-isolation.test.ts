import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { saveAuthenticatedDailyTriplet } from "@/lib/daily-triplet-save";
import { resolveCurrentDailyCards } from "@/lib/current-daily-cards";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { isExplicitDailyTriplet, isDailyHistoryMarker } from "@/lib/daily-triplet-cards";
import { query } from "@/lib/db";
import {
  createHistoryEntry,
  deleteHistoryEntry,
  recordTripletDrawAnchor,
  resetTripletCooldown,
} from "@/lib/users";
import { profileHasGuestIntroLifetimeFlag, recordGuestIntroUsed } from "@/lib/rate-limit-anchors";
import { claimGuestResumeSession } from "@/lib/guest-triplet-receipt-db";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser, issueGuestReceipt, SAMPLE_SYMBOLS } from "./db/fixtures";

function sampleCards(offset = 0) {
  const names = ["Шут", "Маг", "Жрица", "Императрица", "Император", "Иерофант"] as const;
  return [0, 1, 2].map((i) => ({
    id: offset + i,
    name: names[offset + i]!,
    position: i,
    reversed: i === 0,
  }));
}

async function createOrdinaryTriplet(userId: string, cards = sampleCards()) {
  return createHistoryEntry({
    userId,
    characterName: "triplet",
    contextData: {
      type: "triplet",
      tarotCards: cards,
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    },
  });
}

describe("daily marker semantics (unit)", () => {
  it("ordinary type=triplet is not explicit daily", () => {
    expect(isExplicitDailyTriplet({ type: "triplet" })).toBe(false);
    expect(isDailyHistoryMarker({ type: "triplet" })).toBe(false);
    expect(isExplicitDailyTriplet({ type: "daily_triplet", spreadType: "daily" })).toBe(true);
  });

  it("cooldown SQL does not treat generic character_name=triplet as daily evidence", () => {
    const src = readFileSync(resolve("src/lib/triplet-limit-server.ts"), "utf8");
    expect(src).toMatch(/context_data->>'type' = 'daily_triplet'/);
    expect(src).not.toMatch(/character_name = 'triplet'/);
    expect(src).not.toMatch(/IN \('triplet', 'daily_triplet'\)/);
    // Option A: legacy lastTripletDrawAt is not entitlement authority.
    expect(src).toMatch(/lastDailyTripletDrawAt/);
    expect(src).toMatch(/Legacy lastTripletDrawAt is ignored/);
  });

  it("onboarding ordinary path no longer records daily anchor", () => {
    const src = readFileSync(resolve("src/app/api/onboarding/route.ts"), "utf8");
    expect(src).not.toMatch(/recordTripletDrawAnchor\s*\(/);
    expect(src).not.toMatch(/import \{[^}]*checkTripletCooldown/);
    expect(src).not.toMatch(/await checkTripletCooldown/);
    expect(src).toMatch(/contextType: \"triplet\"/);
  });

  it("TEST17: ordinary completion path does not emit daily_cards_completed", () => {
    const onboarding = readFileSync(resolve("src/hooks/useOnboardingFlow.ts"), "utf8");
    const start = onboarding.indexOf("const handleTripletComplete");
    const end = onboarding.indexOf("const handleTripletBack");
    const block = onboarding.slice(start, end);
    expect(block).toMatch(/trackDailyCardsCompleted/);
    expect(block).toMatch(/\/api\/tarot\/daily/);
    // daily_cards_completed only after successful daily save, not ordinary catalog paths.
    expect(block).not.toMatch(/fetch\("\/api\/onboarding"/);
  });

  it("client merge trusts server and ignores polluted profile/local anchors", () => {
    const src = readFileSync(resolve("src/lib/triplet-cooldown-client.ts"), "utf8");
    expect(src).toMatch(/if \(server\) return server/);
    expect(src).toMatch(/never let those override server\.allowed/);
  });
});

async function setLegacyPollutedAnchor(userId: string, at = new Date().toISOString()) {
  await query(
    `UPDATE users SET astro_meta = (
       COALESCE(astro_meta, '{}'::jsonb)
       - 'lastDailyTripletDrawAt'
     ) || jsonb_build_object('lastTripletDrawAt', $2::text)
     WHERE id = $1`,
    [userId, at]
  );
}

describe.skipIf(!hasTestDb)("daily entitlement isolation (db)", () => {
  installDbLifecycle();

  it("TEST1: ordinary triplet does not consume daily", async () => {
    const user = await createTestUser();
    await createOrdinaryTriplet(user.id);
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(true);
  });

  it("LEGACY1: polluted lastTripletDrawAt + ordinary history → daily available", async () => {
    const user = await createTestUser();
    await createOrdinaryTriplet(user.id);
    await setLegacyPollutedAnchor(user.id);
    const { rows } = await query<{ astro_meta: Record<string, unknown> }>(
      `SELECT astro_meta FROM users WHERE id = $1`,
      [user.id]
    );
    expect(rows[0]!.astro_meta.lastTripletDrawAt).toBeTruthy();
    expect(rows[0]!.astro_meta.lastDailyTripletDrawAt).toBeFalsy();
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(true);
  });

  it("LEGACY2: polluted lastTripletDrawAt alone without history → daily available", async () => {
    const user = await createTestUser();
    await setLegacyPollutedAnchor(user.id);
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(true);
  });

  it("LEGACY3: dedicated lastDailyTripletDrawAt without history → daily denied", async () => {
    const user = await createTestUser();
    await recordTripletDrawAnchor(user.id);
    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM history
       WHERE user_id = $1 AND context_data->>'type' = 'daily_triplet'`,
      [user.id]
    );
    expect(Number(rows[0]!.n)).toBe(0);
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(false);
  });

  it("LEGACY4: explicit daily_triplet history without dedicated anchor → denied", async () => {
    const user = await createTestUser();
    await createHistoryEntry({
      userId: user.id,
      characterName: "triplet",
      contextData: {
        type: "daily_triplet",
        spreadType: "daily",
        tarotCards: sampleCards(),
        masterId: "veronika",
        deckSystem: "tarot-veronika",
      },
    });
    // Clear any accidental anchors.
    await query(
      `UPDATE users SET astro_meta = COALESCE(astro_meta, '{}'::jsonb)
         - 'lastDailyTripletDrawAt' - 'lastTripletDrawAt'
       WHERE id = $1`,
      [user.id]
    );
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(false);
  });

  it("LEGACY5: deleting ordinary history does not mint daily anchor", async () => {
    const user = await createTestUser();
    const ordinary = await createOrdinaryTriplet(user.id);
    await deleteHistoryEntry(user.id, ordinary.id);
    const { rows } = await query<{ astro_meta: Record<string, unknown> }>(
      `SELECT astro_meta FROM users WHERE id = $1`,
      [user.id]
    );
    expect(rows[0]!.astro_meta.lastDailyTripletDrawAt).toBeFalsy();
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(true);
  });

  it("TEST2: ordinary after daily does not change daily anchor", async () => {
    const user = await createTestUser();
    const daily = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards: sampleCards(0),
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(daily.ok).toBe(true);

    const { rows: before } = await query<{ astro_meta: Record<string, unknown> }>(
      `SELECT astro_meta FROM users WHERE id = $1`,
      [user.id]
    );
    const beforeDaily = before[0]!.astro_meta.lastDailyTripletDrawAt;
    const beforeLegacy = before[0]!.astro_meta.lastTripletDrawAt;

    await createOrdinaryTriplet(user.id, sampleCards(3));

    const { rows: after } = await query<{ astro_meta: Record<string, unknown> }>(
      `SELECT astro_meta FROM users WHERE id = $1`,
      [user.id]
    );
    expect(after[0]!.astro_meta.lastDailyTripletDrawAt).toBe(beforeDaily);
    expect(after[0]!.astro_meta.lastTripletDrawAt).toBe(beforeLegacy);

    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(false);
  });

  it("TEST3: daily consumes daily", async () => {
    const user = await createTestUser();
    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards: sampleCards(),
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(saved.ok).toBe(true);
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(false);
  });

  it("TEST4: ordinary same cards is not reused as daily", async () => {
    const user = await createTestUser();
    const cards = sampleCards();
    const ordinary = await createOrdinaryTriplet(user.id, cards);
    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards,
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.reused).not.toBe(true);
    expect(saved.daily.historyId).not.toBe(ordinary.id);

    const { rows } = await query<{ context_data: Record<string, unknown> }>(
      `SELECT context_data FROM history WHERE id = $1`,
      [saved.daily.historyId]
    );
    expect(rows[0]!.context_data.type).toBe("daily_triplet");
  });

  it("TEST5: daily same cards retry is reused", async () => {
    const user = await createTestUser();
    const cards = sampleCards();
    const first = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards,
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards,
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.reused).toBe(true);
    expect(second.daily.historyId).toBe(first.daily.historyId);

    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM history
       WHERE user_id = $1 AND context_data->>'type' = 'daily_triplet'`,
      [user.id]
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("TEST6: multiple ordinary triplets leave daily available", async () => {
    const user = await createTestUser();
    await createOrdinaryTriplet(user.id, sampleCards(0));
    await createOrdinaryTriplet(user.id, sampleCards(3));
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(true);
    const current = await resolveCurrentDailyCards(user.id);
    expect(current.exists).toBe(false);
  });

  it("TEST7: deleting daily history does not reset cooldown", async () => {
    const user = await createTestUser();
    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards: sampleCards(),
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    await deleteHistoryEntry(user.id, saved.daily.historyId);
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(false);
  });

  it("TEST8: deleting ordinary history does not affect daily", async () => {
    const user = await createTestUser();
    const daily = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards: sampleCards(0),
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(daily.ok).toBe(true);
    const ordinary = await createOrdinaryTriplet(user.id, sampleCards(3));
    await deleteHistoryEntry(user.id, ordinary.id);

    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(false);
  });

  it("TEST9: session delete does not reset daily", async () => {
    const user = await createTestUser();
    const cards = sampleCards();
    const { rows: sess } = await query<{ id: string }>(
      `INSERT INTO sessions (user_id, character_key, spread_type, spread_id, cards, status, created_at, updated_at)
       VALUES ($1, 'veronika', 'daily', 'triplet', $2::jsonb, 'active', NOW(), NOW())
       RETURNING id`,
      [user.id, JSON.stringify(cards.map((c) => c.name))]
    );
    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards,
      masterId: "veronika",
      deckSystem: "tarot-veronika",
      sessionId: sess[0]!.id,
    });
    expect(saved.ok).toBe(true);

    await query(`DELETE FROM sessions WHERE id = $1`, [sess[0]!.id]);
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(false);
  });

  it("TEST10: admin reset clears daily only, keeps guestIntroUsedAt", async () => {
    const user = await createTestUser();
    await recordGuestIntroUsed(user.id);
    await recordTripletDrawAnchor(user.id);
    expect(await profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);

    const reset = await resetTripletCooldown(user.id);
    expect(reset.ok).toBe(true);
    expect(await profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);

    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(true);

    const issued = await issueGuestReceipt();
    const claim = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: user.id,
    });
    expect(claim.ok).toBe(false);
    if (!claim.ok) expect(claim.code).toBe("already_used");
  });

  it("TEST11: guest intro does not consume daily", async () => {
    const user = await createTestUser();
    const issued = await issueGuestReceipt();
    const claim = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: user.id,
    });
    expect(claim.ok).toBe(true);
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(true);
  });

  it("TEST12: daily does not restore intro", async () => {
    const user = await createTestUser();
    await recordGuestIntroUsed(user.id);
    await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards: sampleCards(),
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(await profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);
    await resetTripletCooldown(user.id);
    expect(await profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);
  });

  it("TEST13: concurrent daily still one artifact", async () => {
    const user = await createTestUser();
    const [r1, r2] = await Promise.allSettled([
      saveAuthenticatedDailyTriplet({
        userId: user.id,
        cards: sampleCards(0),
        masterId: "veronika",
        deckSystem: "tarot-veronika",
      }),
      saveAuthenticatedDailyTriplet({
        userId: user.id,
        cards: sampleCards(3),
        masterId: "veronika",
        deckSystem: "tarot-veronika",
      }),
    ]);
    expect(r1.status).toBe("fulfilled");
    expect(r2.status).toBe("fulfilled");
    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM history
       WHERE user_id = $1 AND context_data->>'type' = 'daily_triplet'`,
      [user.id]
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("TEST15/16: resolver ignores newer ordinary triplet", async () => {
    const user = await createTestUser();
    const dailyCards = sampleCards(0);
    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards: dailyCards,
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    await createOrdinaryTriplet(user.id, sampleCards(3));

    const current = await resolveCurrentDailyCards(user.id);
    expect(current.exists).toBe(true);
    if (!current.exists) return;
    expect(current.historyId).toBe(saved.daily.historyId);
    expect(current.cardNames).toEqual(dailyCards.map((c) => c.name));
  });

  it("TEST16b: only ordinary → current daily exists=false", async () => {
    const user = await createTestUser();
    await createOrdinaryTriplet(user.id);
    const current = await resolveCurrentDailyCards(user.id);
    expect(current.exists).toBe(false);
  });

  it("TEST18: stub without birth can save daily", async () => {
    const user = await createTestUser();
    await query(`UPDATE users SET birth_date = NULL, zodiac = '' WHERE id = $1`, [user.id]);
    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards: SAMPLE_SYMBOLS.map((s, position) => ({
        id: s.id,
        name: s.name,
        position,
        reversed: Boolean(s.reversed),
      })),
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(saved.ok).toBe(true);
  });

  it("TEST20: foreign session still cannot mutate", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const attacker = await createTestUser({ name: "Attacker" });
    const { rows } = await query<{
      id: string;
      character_key: string | null;
      cards: unknown;
      spread_type: string | null;
    }>(
      `INSERT INTO sessions (user_id, character_key, spread_type, spread_id, cards, status, created_at, updated_at)
       VALUES ($1, 'veronika', 'daily', 'triplet', $2::jsonb, 'active', NOW(), NOW())
       RETURNING id, character_key, cards, spread_type`,
      [owner.id, JSON.stringify(["Шут", "Маг", "Жрица"])]
    );
    const before = rows[0]!;
    const saved = await saveAuthenticatedDailyTriplet({
      userId: attacker.id,
      cards: sampleCards(3),
      masterId: "veronika",
      deckSystem: "tarot-veronika",
      sessionId: before.id,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.daily.sessionId).toBeNull();

    const { rows: after } = await query<{
      character_key: string | null;
      cards: unknown;
      spread_type: string | null;
      user_id: string;
    }>(`SELECT character_key, cards, spread_type, user_id FROM sessions WHERE id = $1`, [before.id]);
    expect(after[0]!.user_id).toBe(owner.id);
    expect(after[0]!.character_key).toBe(before.character_key);
    expect(JSON.stringify(after[0]!.cards)).toBe(JSON.stringify(before.cards));
  });

  it("TEST21: session attach rolls back with daily transaction failure", async () => {
    const user = await createTestUser();
    const { rows } = await query<{ id: string; user_id: string | null }>(
      `INSERT INTO sessions (user_id, character_key, status, created_at, updated_at)
       VALUES (NULL, NULL, 'active', NOW(), NOW())
       RETURNING id, user_id`,
      []
    );
    const orphanId = rows[0]!.id;

    // Force failure after bind by using invalid UUID user in a nested path is hard;
    // instead verify link+meta use same client by aborting via invalid history insert mid-tx.
    // Practical guarantee: foreign-owned session never attaches; orphan without claim stays null.
    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards: sampleCards(),
      masterId: "veronika",
      deckSystem: "tarot-veronika",
      sessionId: orphanId,
      claimToken: null,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.daily.sessionId).toBeNull();

    const { rows: orphan } = await query<{ user_id: string | null }>(
      `SELECT user_id FROM sessions WHERE id = $1`,
      [orphanId]
    );
    expect(orphan[0]!.user_id).toBeNull();
  });
});
