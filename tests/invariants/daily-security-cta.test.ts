import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { saveAuthenticatedDailyTriplet } from "@/lib/daily-triplet-save";
import { validateDailyTripletInput } from "@/lib/daily-triplet-validate";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { query } from "@/lib/db";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser, SAMPLE_SYMBOLS } from "./db/fixtures";

function sampleCards(offset = 0) {
  const names = ["Шут", "Маг", "Жрица", "Императрица", "Император", "Иерофант"] as const;
  return [0, 1, 2].map((i) => ({
    id: offset + i,
    name: names[offset + i]!,
    position: i,
    reversed: i === 1,
  }));
}

describe("starter CTA honesty (source)", () => {
  it("starter pack CTA is try-cards, not full-reading", () => {
    const section = readFileSync(
      resolve("src/components/editorial/EditorialStarterPackSection.tsx"),
      "utf8"
    );
    const content = readFileSync(resolve("src/lib/editorial-landing-content.ts"), "utf8");
    expect(section).toMatch(/data-starter-state="before_cards"/);
    expect(section).toMatch(/data-starter-cta="try_cards"/);
    expect(section).not.toMatch(/onContinueFullReading/);
    expect(content).toMatch(/primaryCta:\s*"Попробовать 3 карты бесплатно"/);
    expect(content).not.toMatch(/primaryCta:\s*"Получить полный разбор"/);
  });

  it("full-reading CTA lives in GuestTripletDraw after teaser", () => {
    const src = readFileSync(resolve("src/components/GuestTripletDraw.tsx"), "utf8");
    expect(src).toMatch(/data-guest-cta="full_reading"/);
    expect(src).toMatch(/Получить полный разбор/);
    expect(src).toMatch(/openFullReadingGate/);
  });

  it("landing hides registration starter for authenticated users", () => {
    const src = readFileSync(resolve("src/components/AuraSellingLanding.tsx"), "utf8");
    expect(src).toMatch(
      /!isLoggedIn\s*\?\s*\(\s*<EditorialStarterPackSection/
    );
  });

  it("session meta update for user is owner-scoped in SQL", () => {
    const src = readFileSync(resolve("src/lib/session.ts"), "utf8");
    expect(src).toMatch(/export async function updateSessionChatMetaForUser/);
    expect(src).toMatch(/WHERE id = \$1 AND user_id = \$2/);
    expect(src).toMatch(/RETURNING id/);
  });

  it("daily save uses advisory lock + owner-scoped session bind", () => {
    const src = readFileSync(resolve("src/lib/daily-triplet-save.ts"), "utf8");
    expect(src).toMatch(/pg_advisory_xact_lock/);
    expect(src).toMatch(/daily-triplet-user:/);
    expect(src).toMatch(/checkTripletCooldownWithClient/);
    expect(src).toMatch(/updateSessionChatMetaForUser/);
    expect(src).toMatch(/if \(linked\)/);
  });
});

describe("daily runtime validation", () => {
  it("rejects invented master without consuming shape", () => {
    const result = validateDailyTripletInput({
      cards: sampleCards(),
      masterId: "random-hacker-value",
      deckSystem: "tarot-veronika",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_MASTER");
  });

  it("rejects fake deck", () => {
    const result = validateDailyTripletInput({
      cards: sampleCards(),
      masterId: "veronika",
      deckSystem: "fake-deck",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_DECK");
  });

  it("rejects invented card names", () => {
    const result = validateDailyTripletInput({
      cards: [
        { id: 0, name: "Моя карта", position: 0, reversed: false },
        { id: 1, name: "Маг", position: 1, reversed: false },
        { id: 2, name: "Жрица", position: 2, reversed: false },
      ],
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_CARDS");
  });

  it("preserves reversed=true for valid cards", () => {
    const result = validateDailyTripletInput({
      cards: SAMPLE_SYMBOLS.map((s, position) => ({
        id: s.id,
        name: s.name,
        position,
        reversed: true,
      })),
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cards.every((c) => c.reversed)).toBe(true);
  });

  it("rejects non-tarot master (runes)", () => {
    const result = validateDailyTripletInput({
      cards: sampleCards(),
      masterId: "ragnar",
      deckSystem: "runes",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_MASTER");
  });
});

describe.skipIf(!hasTestDb)("daily security + atomic entitlement (db)", () => {
  installDbLifecycle();

  it("foreign sessionId cannot mutate another user's session", async () => {
    const owner = await createTestUser({ name: "Owner A" });
    const attacker = await createTestUser({ name: "Attacker B" });
    await query(`UPDATE users SET birth_date = NULL, zodiac = '' WHERE id = $1`, [
      attacker.id,
    ]);

    const { rows: sessRows } = await query<{
      id: string;
      character_key: string | null;
      cards: unknown;
      spread_type: string | null;
      spread_id: string | null;
    }>(
      `INSERT INTO sessions (user_id, character_key, spread_type, spread_id, cards, status, created_at, updated_at)
       VALUES ($1, 'veronika', 'daily', 'triplet', $2::jsonb, 'active', NOW(), NOW())
       RETURNING id, character_key, cards, spread_type, spread_id`,
      [owner.id, JSON.stringify(["Шут", "Маг", "Жрица"])]
    );
    const session = sessRows[0]!;
    const before = { ...session };

    const cards = sampleCards(3); // different from owner's session cards
    const saved = await saveAuthenticatedDailyTriplet({
      userId: attacker.id,
      cards,
      masterId: "veronika",
      deckSystem: "tarot-veronika",
      sessionId: session.id,
    });

    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.daily.sessionId).toBeNull();
    expect(saved.daily.historyId).toBeTruthy();

    const { rows: afterRows } = await query<{
      id: string;
      character_key: string | null;
      cards: unknown;
      spread_type: string | null;
      spread_id: string | null;
      user_id: string;
    }>(`SELECT id, character_key, cards, spread_type, spread_id, user_id FROM sessions WHERE id = $1`, [
      session.id,
    ]);
    const after = afterRows[0]!;
    expect(after.user_id).toBe(owner.id);
    expect(after.character_key).toBe(before.character_key);
    expect(after.spread_type).toBe(before.spread_type);
    expect(after.spread_id).toBe(before.spread_id);
    expect(JSON.stringify(after.cards)).toBe(JSON.stringify(before.cards));
  });

  it("own session metadata updates when ownership matches", async () => {
    const user = await createTestUser();
    const cards = sampleCards();
    const { rows } = await query<{ id: string }>(
      `INSERT INTO sessions (user_id, character_key, spread_type, spread_id, cards, status, created_at, updated_at)
       VALUES ($1, 'veronika', NULL, NULL, NULL, 'active', NOW(), NOW())
       RETURNING id`,
      [user.id]
    );
    const sessionId = rows[0]!.id;
    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards,
      masterId: "veronika",
      deckSystem: "tarot-veronika",
      sessionId,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.daily.sessionId).toBe(sessionId);

    const { rows: after } = await query<{
      character_key: string | null;
      spread_type: string | null;
      spread_id: string | null;
      cards: unknown;
    }>(`SELECT character_key, spread_type, spread_id, cards FROM sessions WHERE id = $1`, [
      sessionId,
    ]);
    expect(after[0]?.character_key).toBe("veronika");
    expect(after[0]?.spread_type).toBe("daily");
    expect(after[0]?.spread_id).toBe("triplet");
    expect(after[0]?.cards).toEqual(cards.map((c) => c.name));
  });

  it("invalid session id does not break daily history save", async () => {
    const user = await createTestUser();
    await query(`UPDATE users SET birth_date = NULL, zodiac = '' WHERE id = $1`, [user.id]);
    const cards = sampleCards();
    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards,
      masterId: "veronika",
      deckSystem: "tarot-veronika",
      sessionId: "00000000-0000-4000-8000-000000000099",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.daily.sessionId).toBeNull();
    expect(saved.daily.historyId).toBeTruthy();
  });

  it("concurrent daily saves yield at most one new artifact", async () => {
    const user = await createTestUser();
    const a = sampleCards(0);
    const b = sampleCards(3);

    const [r1, r2] = await Promise.allSettled([
      saveAuthenticatedDailyTriplet({
        userId: user.id,
        cards: a,
        masterId: "veronika",
        deckSystem: "tarot-veronika",
      }),
      saveAuthenticatedDailyTriplet({
        userId: user.id,
        cards: b,
        masterId: "veronika",
        deckSystem: "tarot-veronika",
      }),
    ]);

    expect(r1.status).toBe("fulfilled");
    expect(r2.status).toBe("fulfilled");
    if (r1.status !== "fulfilled" || r2.status !== "fulfilled") return;

    const results = [r1.value, r2.value];
    const oks = results.filter((r) => r.ok);
    const cools = results.filter((r) => !r.ok && r.code === "COOLDOWN");
    const reused = oks.filter((r) => r.ok && r.reused);

    expect(oks.length + cools.length).toBe(2);
    expect(oks.length).toBeGreaterThanOrEqual(1);

    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM history
       WHERE user_id = $1
         AND character_name = 'triplet'
         AND context_data->>'type' = 'daily_triplet'`,
      [user.id]
    );
    expect(Number(rows[0]!.n)).toBe(1);

    // Second request is either COOLDOWN or reused same artifact — never a second identity.
    if (oks.length === 2) {
      expect(reused.length).toBe(1);
      expect(oks[0]!.ok && oks[1]!.ok && oks[0].daily.historyId === oks[1].daily.historyId).toBe(
        true
      );
    } else {
      expect(cools.length).toBe(1);
    }
  });

  it("immediate retry with same cards is idempotent", async () => {
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

  it("invalid master does not consume cooldown", async () => {
    const user = await createTestUser();
    const before = await checkTripletCooldown(user.id);
    expect(before.allowed).toBe(true);

    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards: sampleCards(),
      masterId: "random-hacker-value",
      deckSystem: "tarot-veronika",
    });
    expect(saved.ok).toBe(false);
    if (saved.ok) return;
    expect(saved.code).toBe("INVALID_MASTER");

    const after = await checkTripletCooldown(user.id);
    expect(after.allowed).toBe(true);
    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM history WHERE user_id = $1`,
      [user.id]
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("invalid deck / cards do not consume cooldown", async () => {
    const user = await createTestUser();
    const deckFail = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards: sampleCards(),
      masterId: "veronika",
      deckSystem: "fake-deck",
    });
    expect(deckFail.ok).toBe(false);
    if (!deckFail.ok) expect(deckFail.code).toBe("INVALID_DECK");

    const cardsFail = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards: [
        { id: 99, name: "Моя карта", position: 0, reversed: false },
        { id: 1, name: "Маг", position: 1, reversed: false },
        { id: 2, name: "Жрица", position: 2, reversed: false },
      ],
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(cardsFail.ok).toBe(false);
    if (!cardsFail.ok) expect(cardsFail.code).toBe("INVALID_CARDS");

    const after = await checkTripletCooldown(user.id);
    expect(after.allowed).toBe(true);
  });

  it("stub user without birth can save daily", async () => {
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
});
