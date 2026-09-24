import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const disabledScenes = [
  "tarot_atmosphere",
  "destiny_card",
  "scene_illustration",
  "final_report",
] as const;

function frontendSources(dir: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "api" || entry.name === "admin") continue;
      paths.push(...frontendSources(absolute));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      paths.push(absolute);
    }
  }
  return paths;
}

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(),
  getSetting: vi.fn(),
  profile: vi.fn(),
  configured: vi.fn(),
  generate: vi.fn(),
  charge: vi.fn(),
}));

vi.mock("@/lib/require-auth", () => ({ requireUserAuth: mocks.auth }));
vi.mock("@/lib/api-guards", () => ({ enforceImageGenRateLimit: mocks.rateLimit }));
vi.mock("@/lib/settings", () => ({ getSetting: mocks.getSetting }));
vi.mock("@/lib/accounts", () => ({
  getProfileUserIdForAccount: mocks.profile,
  resolveUnlimitedAccess: vi.fn(),
}));
vi.mock("@/lib/image-gen", () => ({
  isImageGenConfigured: mocks.configured,
  generateSceneImage: mocks.generate,
}));
vi.mock("@/lib/users", () => ({
  findExistingSceneArtUrl: vi.fn(),
  persistSceneArtForSpread: vi.fn(),
}));
vi.mock("@/lib/scene-image-store", () => ({ normalizeSceneImageUrl: vi.fn() }));
vi.mock("@/lib/rune-settings", () => ({ getRuneSettings: vi.fn() }));
vi.mock("@/lib/rune-service", () => ({ isRuneBillingActive: vi.fn() }));
vi.mock("@/lib/services/billing-service", () => ({
  BillingService: { chargeRuneAction: mocks.charge, rollbackChargeEx: vi.fn() },
  InsufficientFundsError: class InsufficientFundsError extends Error {},
  insufficientFundsResponse: vi.fn(),
}));
vi.mock("@/lib/async-job-worker-auth", () => ({
  getAsyncJobWorkerUserId: vi.fn(),
  isAsyncJobWorkerConfigured: vi.fn(),
}));
vi.mock("@/lib/async-job-enqueue", () => ({ enqueuePaidAsyncJob: vi.fn() }));
vi.mock("@/lib/async-job-lifecycle", () => ({
  trackWorkerJobCompleted: vi.fn(),
  trackWorkerJobFailed: vi.fn(),
}));

import { POST } from "@/app/api/image/generate/route";

describe("paid scene-image auto generation is disabled", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("SCENE_IMAGE_GENERATION_ENABLED", "false");
    mocks.auth.mockResolvedValue({ sub: "account" });
    mocks.profile.mockResolvedValue("profile");
    mocks.rateLimit.mockResolvedValue(null);
    mocks.configured.mockReturnValue(true);
    mocks.getSetting.mockResolvedValue({
      enabled: true,
      scenes: Object.fromEntries(disabledScenes.map((scene) => [scene, false])),
    });
  });

  it.each(disabledScenes)("rejects disabled %s before generation or rune billing", async (scene) => {
    mocks.getSetting.mockResolvedValue({
      enabled: true,
      scenes: Object.fromEntries(disabledScenes.map((item) => [item, true])),
    });
    const response = await POST(
      new NextRequest("http://localhost/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene, aiResponseText: "answer" }),
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.charge).not.toHaveBeenCalled();
  });

  it("has no automatic image API caller in user-facing source", () => {
    const sources = [
      ...frontendSources(join(ROOT, "src", "app")),
      ...frontendSources(join(ROOT, "src", "components")),
      ...frontendSources(join(ROOT, "src", "hooks")),
    ];
    const offenders = sources.filter((path) => {
      if (path.endsWith("useSceneImage.ts")) return false;
      const source = readFileSync(path, "utf8");
      return (
        source.includes("/api/image/generate") ||
        source.includes("@/hooks/useSceneImage") ||
        source.includes("requestSceneImage(")
      );
    });

    expect(offenders).toEqual([]);
    expect(read("src/components/TarotTriplet.tsx")).not.toMatch(/useSceneImage|requestSceneImage/);
    expect(read("src/hooks/useChatActions.ts")).not.toMatch(/attachSceneToAssistantMessage/);
    expect(read("src/components/HomePage.tsx")).not.toMatch(/requestSceneImage|attachSceneToAssistantMessage/);
  });

  it("keeps all four paid scenes off in repository defaults", () => {
    const defaults = read("src/lib/settings.ts");
    const schema = read("src/lib/schema.sql");
    for (const scene of disabledScenes) {
      expect(defaults).toMatch(new RegExp(`${scene}: false`));
      expect(schema).toMatch(new RegExp(`\\"${scene}\\":false`));
    }
  });

  it("forces persisted scene settings off and also requires a server flag", () => {
    const migration = read("scripts/migrations/157_disable_paid_scene_images.sql");
    for (const scene of disabledScenes) {
      expect(migration).toContain(`{scenes,${scene}}`);
    }
    expect(migration).toContain("WHERE key = 'visual'");
    expect(read("src/app/api/image/generate/route.ts")).toContain(
      'process.env.SCENE_IMAGE_GENERATION_ENABLED !== "true"'
    );
  });

  it("does not advertise prices for disabled image actions", () => {
    const tariffs = read("src/lib/tariff-catalog.ts");
    for (const action of [
      "DESTINY_CARD",
      "SCENE_ILLUSTRATION",
      "TAROT_ATMOSPHERE",
      "FINAL_REPORT",
    ]) {
      expect(tariffs).not.toContain(`\"${action}\"`);
    }
  });

  it("keeps the normal three-card flow and silent historical-image fallback", () => {
    const triplet = read("src/components/TarotTriplet.tsx");
    const sceneImage = read("src/components/SceneImage.tsx");
    expect(triplet).toContain("<DeckCard");
    expect(triplet).toContain("await onComplete(deck, teaser)");
    expect(sceneImage).toContain("if (!loading && (!displayUrl || loadFailed)) return null;");
  });

  it("keeps the refund utility dry-run first and idempotent", () => {
    const refund = read("scripts/refund-disabled-scene-images.mjs");
    expect(refund).toContain("const apply = args.has(\"--apply\")");
    expect(refund).toContain("EXPECTED_SPEND_COUNT = 13");
    expect(refund).toContain("EXPECTED_RUNE_TOTAL = 140");
    expect(refund).toContain("DESTINY_CARD: { spendCount: 3, runeTotal: 60 }");
    expect(refund).toContain("TAROT_ATMOSPHERE: { spendCount: 10, runeTotal: 80 }");
    expect(refund).toContain("SCENE_ILLUSTRATION: { spendCount: 0, runeTotal: 0 }");
    expect(refund).toContain("FINAL_REPORT: { spendCount: 0, runeTotal: 0 }");
    expect(refund).toContain("CONFIRM_SCENE_IMAGE_REFUND");
    expect(refund).toContain("ON CONFLICT (refund_of_transaction_id)");
    expect(refund).toContain("FOR UPDATE");
  });
});
