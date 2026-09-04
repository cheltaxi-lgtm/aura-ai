import { describe, expect, it } from "vitest";
import { consumePhotoAuthDraft, savePhotoAuthDraft, PHOTO_AUTH_DRAFT_KEY, PHOTO_AUTH_DRAFT_TTL_MS, type PhotoAuthDraft } from "@/lib/photo-auth-draft";

function storage() {
  const items = new Map<string, string>();
  return { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => { items.set(k, v); }, removeItem: (k: string) => { items.delete(k); } };
}
const draft: PhotoAuthDraft = { mode: "upload", masterId: "veronika", question: "Как подготовиться к разговору?", image: { base64: "YWJj", mimeType: "image/jpeg" } };

describe("photo input survives authentication without granting authority", () => {
  it("restores the photo and question exactly once", () => {
    const s = storage();
    expect(savePhotoAuthDraft(draft, s, 100)).toBe(true);
    expect(consumePhotoAuthDraft(s, 200)).toEqual(draft);
    expect(consumePhotoAuthDraft(s, 201)).toBeNull();
  });
  it("preserves manual entry without a photo", () => {
    const s = storage();
    const manual = { mode: "mark" as const, masterId: "ragnar", question: "Вопрос" };
    savePhotoAuthDraft(manual, s, 100);
    expect(consumePhotoAuthDraft(s, 101)).toEqual(manual);
  });
  it("expires, removes malformed input and ignores authority fields", () => {
    const s = storage();
    savePhotoAuthDraft(draft, s, 100);
    expect(consumePhotoAuthDraft(s, 100 + PHOTO_AUTH_DRAFT_TTL_MS)).toBeNull();
    s.setItem(PHOTO_AUTH_DRAFT_KEY, "{");
    expect(consumePhotoAuthDraft(s)).toBeNull();
    s.setItem(PHOTO_AUTH_DRAFT_KEY, JSON.stringify({ ...draft, expiresAt: 300, balance: 1000, sessionId: "someone-else", isFree: true }));
    expect(consumePhotoAuthDraft(s, 200)).toEqual(draft);
  });
  it("rejects oversized or executable image data and reports blocked storage", () => {
    const s = storage();
    expect(savePhotoAuthDraft({ ...draft, image: { ...draft.image!, base64: "A".repeat(3_400_004) } }, s)).toBe(false);
    expect(savePhotoAuthDraft({ ...draft, image: { base64: "YWJj", mimeType: "image/svg+xml" } } as unknown as PhotoAuthDraft, s)).toBe(false);
    const blocked = { ...s, setItem: () => { throw new Error("quota"); } };
    expect(savePhotoAuthDraft(draft, blocked)).toBe(false);
    expect(consumePhotoAuthDraft(s)).toBeNull();
  });
});
