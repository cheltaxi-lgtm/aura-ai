/**
 * Palm snapshot contract: normalize, teaser strip, billing keys, cookie isolation.
 */
import { describe, expect, it } from "vitest";

import {
  alignPalmSnapshot,
  healPalmTeaser,
  normalizePalmSnapshot,
  palmSnapshotForClient,
  toPalmTeaserSnapshot,
  type PalmSnapshot,
} from "@/lib/palm-constants";
import {
  bindPalmChargeIdempotencyKey,
  palmSpendBelongsToSnapshot,
  palmSpendKeyForSnapshot,
} from "@/lib/palm-reading-billing";
import { PALM_GUEST_CLAIM_COOKIE } from "@/lib/palm-guest-claim-cookie";
import { GUEST_RESUME_COOKIE, GUEST_BINDING_COOKIE } from "@/lib/guest-resume-cookie";
import { AURA_GUEST_CLAIM_COOKIE } from "@/lib/aura-guest-claim-cookie";

function sampleRaw() {
  return {
    handDetected: true,
    whichHand: "left",
    handShape: "water",
    majorLines: [
      { key: "life", present: true, length: "long", quality: "clear", note: "устойчивый ритм" },
      { key: "head", present: true, length: "medium", quality: "forked", note: "" },
    ],
    mounts: [{ key: "venus", prominence: "strong", note: "тепло" }],
    marks: [{ key: "star", where: "аполлон", note: "видимость" }],
    verdict: "love",
    teaser: "Рука воды: чувство ведёт, линия сердца громче остальных.",
  };
}

describe("palm-snapshot", () => {
  it("normalize fills all four lines and seven mounts", () => {
    const snap = normalizePalmSnapshot(sampleRaw(), "right");
    expect(snap).not.toBeNull();
    expect(snap!.whichHand).toBe("left");
    expect(snap!.handShape).toBe("water");
    expect(snap!.majorLines.map((l) => l.key)).toEqual(["life", "head", "heart", "fate"]);
    expect(snap!.mounts.map((m) => m.key)).toEqual([
      "venus",
      "jupiter",
      "saturn",
      "apollo",
      "mercury",
      "mars",
      "luna",
    ]);
    expect(snap!.majorLines.find((l) => l.key === "heart")?.length).toBe("medium");
    expect(snap!.mounts.find((m) => m.key === "venus")?.prominence).toBe("strong");
  });

  it("rejects payloads without a detected hand", () => {
    expect(normalizePalmSnapshot({ ...sampleRaw(), handDetected: false })).toBeNull();
    expect(normalizePalmSnapshot(null)).toBeNull();
    expect(normalizePalmSnapshot("palm")).toBeNull();
  });

  it("teaser strip drops lines, mounts and marks", () => {
    const snap = normalizePalmSnapshot(sampleRaw()) as PalmSnapshot;
    const teaser = toPalmTeaserSnapshot(snap);
    expect(teaser.handShape).toBe("water");
    expect(teaser.teaser).toContain("чувство");
    expect(teaser).not.toHaveProperty("majorLines");
    expect(teaser).not.toHaveProperty("mounts");
    expect(teaser).not.toHaveProperty("marks");
  });

  it("client snapshot stays stripped until a paid report exists", () => {
    const snap = normalizePalmSnapshot(sampleRaw()) as PalmSnapshot;
    const unpaid = palmSnapshotForClient(snap, false, null);
    expect(unpaid).not.toHaveProperty("majorLines");
    const paidEmpty = palmSnapshotForClient(snap, true, "   ");
    expect(paidEmpty).not.toHaveProperty("majorLines");
    const paid = palmSnapshotForClient(snap, true, "## Разбор");
    expect(paid).toHaveProperty("majorLines");
  });

  it("align heals empty teaser from hand shape", () => {
    const snap = alignPalmSnapshot({
      version: 1,
      handDetected: true,
      whichHand: "right",
      handShape: "fire",
      majorLines: [],
      mounts: [],
      marks: [],
      verdict: "mixed",
      teaser: "   ",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(snap.teaser).toContain("Огонь");
    expect(healPalmTeaser("", "earth")).toContain("Земля");
  });

  it("billing reuse keys are snapshot-scoped and never tarot/aura", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      palmSpendBelongsToSnapshot([{ idempotencyKey: `palm-reading:${id}` }], id)
    ).toBe(true);
    expect(
      palmSpendBelongsToSnapshot([{ idempotencyKey: `palm-reading:${id}:retry` }], id)
    ).toBe(true);
    expect(
      palmSpendBelongsToSnapshot([{ idempotencyKey: `aura-reading:${id}` }], id)
    ).toBe(false);
    expect(
      palmSpendBelongsToSnapshot([{ idempotencyKey: `guest-triplet:${id}` }], id)
    ).toBe(false);
  });

  it("charge keys cannot replay another snapshot's spend", () => {
    const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(bindPalmChargeIdempotencyKey(a, `palm-reading:${b}`)).toBe(
      palmSpendKeyForSnapshot(a)
    );
    expect(bindPalmChargeIdempotencyKey(a, "yesterday-foreign-key")).toBe(
      palmSpendKeyForSnapshot(a)
    );
    expect(bindPalmChargeIdempotencyKey(a, `palm-reading:${a}`)).toBe(`palm-reading:${a}`);
    expect(bindPalmChargeIdempotencyKey(a, `palm-reading:${a}:retry`)).toBe(
      `palm-reading:${a}:retry`
    );
  });

  it("palm claim cookie is isolated from tarot receipt and aura claim", () => {
    expect(PALM_GUEST_CLAIM_COOKIE).toBe("zovus_palm_guest_claim");
    expect(PALM_GUEST_CLAIM_COOKIE).not.toBe(GUEST_RESUME_COOKIE);
    expect(PALM_GUEST_CLAIM_COOKIE).not.toBe(GUEST_BINDING_COOKIE);
    expect(PALM_GUEST_CLAIM_COOKIE).not.toBe(AURA_GUEST_CLAIM_COOKIE);
  });
});
