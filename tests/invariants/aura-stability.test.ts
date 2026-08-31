/**
 * Aura color / day stability — methodology contract.
 *
 * Core (dominantColor) is stable for weeks. One snapshot per Moscow day.
 * Same photo bytes reuse the stored reading, scoped to this person.
 * Photos are never stored — only a hash and the structured snapshot.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  AURA_CORE_LOCK_MS,
  AURA_DAY_TIMEZONE,
  lockAuraCoreIfRecent,
} from "@/lib/services/aura-guest-service";
import type { AuraSnapshot } from "@/lib/aura-constants";
import { AURA_COLORS } from "@/lib/aura-constants";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function stubSnapshot(dominantKey: "blue" | "gold"): AuraSnapshot {
  return {
    version: 1,
    faceDetected: true,
    dominantColor: AURA_COLORS[dominantKey],
    secondaryColors: [],
    layers: [],
    chakras: [],
    verdict: "mixed",
    teaser: "test",
    createdAt: new Date().toISOString(),
  };
}

describe("aura-stability", () => {
  it("teaser reuses today's snapshot and scoped photo hash without a new row", () => {
    const teaser = read("src/app/api/aura/teaser/route.ts");
    expect(teaser).toContain("findTodaysAuraSnapshotForUser");
    expect(teaser).toContain("findTodaysAuraSnapshotByClaimToken");
    expect(teaser).toContain("findScopedSnapshotByPhotoHash");
    expect(teaser).toContain("hashAuraPhoto(trimmed)");
    expect(teaser).toContain('reused: "today"');
    expect(teaser).toContain("claimed:");
    expect(teaser).toContain("hashSafe");
    expect(teaser).not.toContain("findRecentSnapshotByPhotoHash");

    const flow = read("src/components/aura/AuraReadingFlow.tsx");
    expect(flow).toContain("data.claimed === true");
    expect(flow).toContain("setReusedKind");
  });

  it("photo-hash reuse is scoped to the account or this browser cookie", () => {
    const service = read("src/lib/services/aura-guest-service.ts");
    expect(service).toContain("claimed_user_id = $3");
    expect(service).toContain("claim_token_hash = $4");
    expect(service).toContain("claimed_user_id IS NULL");
    expect(service).toContain(AURA_DAY_TIMEZONE);
    expect(service).not.toMatch(
      /WHERE photo_hash = \$1\s+AND created_at > NOW\(\) - \$2::interval\s+ORDER BY/
    );
  });

  it("vision prompt keeps the core and evolves yesterday instead of rerolling", () => {
    const prompts = read("src/lib/aura-reading-prompts.ts");
    const teaser = read("src/app/api/aura/teaser/route.ts");
    expect(prompts).toContain("БАЗА ПОЛЯ");
    expect(prompts).toContain("ПРЕДЫДУЩИЙ СНИМОК");
    expect(prompts).toContain("эволюционируй");
    expect(prompts).toContain("previous?: AuraSnapshot");
    expect(teaser).toContain("previous: previous?.snapshot");
    expect(prompts).toContain("Ядро ауры стабильно");
  });

  it("teaser never persists the original photo", () => {
    const teaser = read("src/app/api/aura/teaser/route.ts");
    const service = read("src/lib/services/aura-guest-service.ts");
    expect(teaser).not.toMatch(/INSERT.*image|photo_base64|image_bytes/);
    expect(service).toContain("never the photo");
    expect(service).toContain("photo_hash");
  });

  it("same-day lock keeps the core, older anchors do not force it", () => {
    const generated = stubSnapshot("gold");
    const recent = lockAuraCoreIfRecent(generated, {
      color: AURA_COLORS.blue,
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    expect(recent.dominantColor.key).toBe("blue");

    const nextDay = lockAuraCoreIfRecent(generated, {
      color: AURA_COLORS.blue,
      createdAt: new Date(Date.now() - AURA_CORE_LOCK_MS - 1_000),
    });
    expect(nextDay.dominantColor.key).toBe("gold");
  });
});
