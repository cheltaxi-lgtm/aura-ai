import { describe, expect, it } from "vitest";
import {
  createGuestResumeToken,
  hashGuestResumeToken,
  isGuestResumeToken,
  buildGuestResumeCardsPayload,
} from "@/lib/guest-triplet-receipt";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { fetchSessionRowRaw, issueGuestReceipt } from "./db/fixtures";

describe("receipt-security", () => {
  it("token is opaque (not JWT) and has no user_id / amount payload", () => {
    const token = createGuestResumeToken();
    expect(isGuestResumeToken(token)).toBe(true);
    expect(token.split(".")).toHaveLength(1);
    expect(token).not.toMatch(/user_id|userId|amount|balance|eyJ/i);
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it("persisted form is hash — raw token is not embedded in cards payload", () => {
    const token = createGuestResumeToken();
    const hash = hashGuestResumeToken(token);
    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    const payload = buildGuestResumeCardsPayload({
      question: "q",
      system: "tarot-veronika",
      symbols: [
        { id: 0, name: "Шут", position: 0, reversed: false },
        { id: 1, name: "Маг", position: 1, reversed: false },
        { id: 2, name: "Жрица", position: 2, reversed: false },
      ],
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(hash);
  });

  it("hash is deterministic for the same token", () => {
    const token = createGuestResumeToken();
    expect(hashGuestResumeToken(token)).toBe(hashGuestResumeToken(token));
  });
});

describe.skipIf(!hasTestDb)("receipt-security (db)", () => {
  installDbLifecycle();

  it("DB hash column: persisted session stores hash, never raw token", async () => {
    const issued = await issueGuestReceipt();
    const row = await fetchSessionRowRaw(issued.session.id);
    expect(row).not.toBeNull();

    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(issued.token);
    expect(row!.guest_resume_token_hash).toBe(issued.tokenHash);
    expect(String(row!.guest_resume_token_hash)).not.toBe(issued.token);

    for (const [key, value] of Object.entries(row!)) {
      if (value == null) continue;
      const asText =
        typeof value === "string"
          ? value
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
      expect(asText, `column ${key} must not contain raw token`).not.toContain(
        issued.token
      );
    }
  });
});
