import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestSceneImage } from "@/lib/scene-images-client";
import type { ImageGenerateRequest } from "@/lib/image-prompts";

const request: ImageGenerateRequest = {
  scene: "destiny_card", userName: "Ася", characterKey: "veronika",
  cards: ["Маг", "Солнце", "Звезда"], spreadId: "triplet",
  userQuestionText: "Первый вопрос", aiResponseText: "Первый ответ",
};
const fetchMock = vi.fn();
const oldStorage = { getItem: vi.fn(() => "/scene-art/previous-account.webp"), setItem: vi.fn() };

describe("scene image client uses current server identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", oldStorage);
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("submits changed question, answer and spread even when old name-only storage exists", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ imageUrl: "/scene-art/first.webp" }))
      .mockResolvedValueOnce(Response.json({ imageUrl: "/scene-art/second.webp" }));
    const changed = { ...request, spreadId: "another-spread", userQuestionText: "Другой вопрос", aiResponseText: "Другой ответ" };
    expect(await requestSceneImage(request)).toBe("/scene-art/first.webp");
    expect(await requestSceneImage(changed)).toBe("/scene-art/second.webp");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/image/generate");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(changed);
    expect(oldStorage.getItem).not.toHaveBeenCalled();
    expect(oldStorage.setItem).not.toHaveBeenCalled();
  });

  it("revalidates identical input after an account switch and does not resurrect an old owner's image", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ imageUrl: "/scene-art/account-a.webp" }))
      .mockResolvedValueOnce(Response.json({ error: "auth_required" }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ imageUrl: "/scene-art/account-b.webp" }));
    expect(await requestSceneImage(request)).toBe("/scene-art/account-a.webp");
    expect(await requestSceneImage(request)).toBeNull();
    expect(await requestSceneImage(request)).toBe("/scene-art/account-b.webp");
    expect(fetchMock.mock.calls.every(([url, options]) => url === "/api/image/generate" && options.credentials === "same-origin")).toBe(true);
    expect(oldStorage.getItem).not.toHaveBeenCalled();
  });
});
