/** Tab-local handoff through authentication. Display input only; never an entitlement. */
export const PHOTO_AUTH_DRAFT_KEY = "zovus_photo_auth_draft_v1";
export const PHOTO_AUTH_DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_BASE64_LENGTH = 3_400_000;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type PhotoAuthDraft = {
  mode: "upload" | "mark";
  masterId: string;
  question: string;
  image?: { base64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" };
};

function validDraft(value: unknown): value is PhotoAuthDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as PhotoAuthDraft;
  if (d.mode !== "upload" && d.mode !== "mark") return false;
  if (typeof d.masterId !== "string" || !/^[a-z0-9_-]{1,64}$/.test(d.masterId)) return false;
  if (typeof d.question !== "string" || d.question.length > 4000) return false;
  if (d.image !== undefined) {
    if (!d.image || !["image/jpeg", "image/png", "image/webp"].includes(d.image.mimeType)) return false;
    const b = d.image.base64;
    if (typeof b !== "string" || !b.length || b.length > MAX_BASE64_LENGTH || b.length % 4 !== 0) return false;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b)) return false;
  }
  return true;
}

export function savePhotoAuthDraft(draft: PhotoAuthDraft, storage: DraftStorage, now = Date.now()): boolean {
  try {
    // Never leave an earlier photo behind if replacement fails.
    storage.removeItem(PHOTO_AUTH_DRAFT_KEY);
    if (!validDraft(draft)) return false;
    storage.setItem(PHOTO_AUTH_DRAFT_KEY, JSON.stringify({ ...draft, expiresAt: now + PHOTO_AUTH_DRAFT_TTL_MS }));
    return true;
  } catch {
    return false;
  }
}

export function consumePhotoAuthDraft(storage: DraftStorage, now = Date.now()): PhotoAuthDraft | null {
  try {
    const raw = storage.getItem(PHOTO_AUTH_DRAFT_KEY);
    storage.removeItem(PHOTO_AUTH_DRAFT_KEY);
    if (!raw || raw.length > MAX_BASE64_LENGTH + 30_000) return null;
    const d = JSON.parse(raw);
    const expiresAt = d?.expiresAt;
    if (!validDraft(d) || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + PHOTO_AUTH_DRAFT_TTL_MS) return null;
    // Whitelist fields: browser state cannot restore a session, balance, or free flag.
    return { mode: d.mode, masterId: d.masterId, question: d.question, ...(d.image ? { image: { base64: d.image.base64, mimeType: d.image.mimeType } } : {}) };
  } catch {
    return null;
  }
}
