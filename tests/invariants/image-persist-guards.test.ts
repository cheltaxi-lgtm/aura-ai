import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), normalize: vi.fn(), persist: vi.fn() }));
vi.mock("@/lib/require-auth", () => ({ requireUserAuth: mocks.auth }));
vi.mock("@/lib/scene-image-store", () => ({ normalizeSceneImageUrl: mocks.normalize }));
vi.mock("@/lib/users", () => ({ persistSceneArtForSpread: mocks.persist }));
import { POST } from "@/app/api/image/persist/route";

describe("retired name-only scene persistence cannot overwrite readings", () => {
  beforeEach(() => vi.resetAllMocks());
  it("preserves the authentication boundary", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it("asks old authenticated clients to refresh without accepting a cached image", async () => {
    mocks.auth.mockResolvedValue({ sub: "account" });
    const response = await POST();
    expect(response.status).toBe(410);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ code: "scene_persist_retired" });
    expect(mocks.normalize).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });
});
