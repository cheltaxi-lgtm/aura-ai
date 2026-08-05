import { describe, expect, it } from "vitest";
import {
  buildGuestResumeCardsPayload,
  computeGuestResumeFingerprint,
  parseGuestResumeCardsPayload,
  validateGuestCompleteInput,
  type GuestResumeSymbol,
} from "@/lib/guest-triplet-receipt";
import {
  claimGuestResumeSession,
  findGuestResumeByTokenHash,
} from "@/lib/guest-triplet-receipt-db";
import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import {
  createTestUser,
  issueGuestReceipt,
  SAMPLE_SYMBOLS,
} from "./db/fixtures";

const SAMPLE: GuestResumeSymbol[] = SAMPLE_SYMBOLS;

function assertSymbolsEqual(
  actual: GuestResumeSymbol[],
  expected: GuestResumeSymbol[]
) {
  const a = [...actual].sort((x, y) => x.position - y.position);
  const e = [...expected].sort((x, y) => x.position - y.position);
  expect(a).toHaveLength(e.length);
  for (let i = 0; i < e.length; i++) {
    expect(a[i].id).toBe(e[i].id);
    expect(a[i].position).toBe(e[i].position);
    expect(a[i].reversed).toBe(e[i].reversed);
  }
}

describe("guest-continuity", () => {
  it("validated complete input preserves id/position/reversed field-by-field", () => {
    const validated = validateGuestCompleteInput({
      masterId: GUEST_TRIPLET_MASTER_ID,
      system: "tarot-veronika",
      spreadId: "triplet",
      question: "Что меня ждёт?",
      cards: SAMPLE.map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        reversed: s.reversed,
      })),
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const byPos = [...validated.symbols].sort((a, b) => a.position - b.position);
    expect(byPos).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(byPos[i].id).toBe(SAMPLE[i].id);
      expect(byPos[i].position).toBe(SAMPLE[i].position);
      expect(byPos[i].reversed).toBe(SAMPLE[i].reversed);
    }
  });

  it("payload round-trip keeps the same symbols (receipt → parse)", () => {
    const payload = buildGuestResumeCardsPayload({
      question: "Что меня ждёт?",
      system: "tarot-veronika",
      symbols: SAMPLE,
    });
    const parsed = parseGuestResumeCardsPayload(payload);
    expect(parsed).not.toBeNull();
    expect(parsed!.symbols).toEqual(SAMPLE);
  });

  it("fingerprint is stable for the same ordered cards (claim continuity key)", () => {
    const a = computeGuestResumeFingerprint({
      system: "tarot-veronika",
      masterId: GUEST_TRIPLET_MASTER_ID,
      spreadId: "triplet",
      symbols: SAMPLE,
    });
    const shuffledOrder = [SAMPLE[2], SAMPLE[0], SAMPLE[1]];
    const b = computeGuestResumeFingerprint({
      system: "tarot-veronika",
      masterId: GUEST_TRIPLET_MASTER_ID,
      spreadId: "triplet",
      symbols: shuffledOrder,
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});

describe.skipIf(!hasTestDb)("guest-continuity (db)", () => {
  installDbLifecycle();

  it("DB claim same cards: issued receipt cards match claim payload field-by-field", async () => {
    const issued = await issueGuestReceipt();
    const user = await createTestUser();

    const claim = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: user.id,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    assertSymbolsEqual(claim.payload.symbols, issued.symbols);
    expect(claim.fingerprint).toBe(issued.fingerprint);
    expect(claim.alreadyClaimed).toBe(false);
  });

  it("claim without receipt: empty token is unavailable and creates no owned guest spread", async () => {
    const user = await createTestUser();
    const before = await findGuestResumeByTokenHash("0".repeat(64));
    expect(before).toBeNull();

    const claim = await claimGuestResumeSession({
      token: "",
      profileUserId: user.id,
    });
    expect(claim.ok).toBe(false);
    if (claim.ok) return;
    expect(claim.code).toBe("unavailable");
  });

  it("repeat claim on used receipt does not mint a second guest spread", async () => {
    const issued = await issueGuestReceipt();
    const user = await createTestUser();

    const first = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: user.id,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Same user retry — alreadyClaimed, same session (no new deck).
    const second = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: user.id,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.alreadyClaimed).toBe(true);
    expect(second.sessionId).toBe(first.sessionId);
    assertSymbolsEqual(second.payload.symbols, issued.symbols);

    // Fresh receipt + same profile that already used free landing → already_used.
    const other = await issueGuestReceipt({
      symbols: [
        { id: 3, name: "Императрица", position: 0, reversed: false },
        { id: 4, name: "Император", position: 1, reversed: false },
        { id: 5, name: "Жрец", position: 2, reversed: true },
      ],
    });
    const blocked = await claimGuestResumeSession({
      token: other.token,
      profileUserId: user.id,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.code).toBe("already_used");
  });

  it("claim with another user's receipt is rejected (no cross-account attach)", async () => {
    const issued = await issueGuestReceipt();
    const userA = await createTestUser({ name: "User A" });
    const userB = await createTestUser({ name: "User B" });

    const claimA = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: userA.id,
    });
    expect(claimA.ok).toBe(true);

    const claimB = await claimGuestResumeSession({
      token: issued.token,
      profileUserId: userB.id,
    });
    expect(claimB.ok).toBe(false);
    if (claimB.ok) return;
    expect(claimB.code).toBe("unavailable");
  });
});
