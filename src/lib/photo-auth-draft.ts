/** Tab-local handoff through authentication. Display input only; never an entitlement. */
export const PHOTO_AUTH_DRAFT_KEY = "zovus_photo_auth_draft_v1";
export const PHOTO_AUTH_DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_BASE64_LENGTH = 3_400_000;
const MAX_RECOGNIZED_CARDS = 40;
const MAX_RECOGNIZED_LABEL_LENGTH = 160;
const MAX_RECOGNIZED_META_LENGTH = 200;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type PhotoAuthDraftRecognition = {
  detectedCards: string[];
  positions?: string[];
  deckType?: string;
  spreadType?: string;
  confidence?: "high" | "medium" | "low" | "unknown";
};

export type PhotoAuthDraft = {
  mode: "upload" | "mark";
  masterId: string;
  question: string;
  image?: { base64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" };
  recognized?: PhotoAuthDraftRecognition;
};

function validShortText(value: unknown, max = MAX_RECOGNIZED_META_LENGTH): value is string {
  return typeof value === "string" && value.length <= max;
}

function validRecognition(value: unknown): value is PhotoAuthDraftRecognition {
  if (!value || typeof value !== "object") return false;
  const recognition = value as PhotoAuthDraftRecognition;
  if (
    !Array.isArray(recognition.detectedCards) ||
    recognition.detectedCards.length < 1 ||
    recognition.detectedCards.length > MAX_RECOGNIZED_CARDS ||
    !recognition.detectedCards.every((card) => validShortText(card, MAX_RECOGNIZED_LABEL_LENGTH) && card.trim())
  ) return false;
  if (
    recognition.positions !== undefined &&
    (!Array.isArray(recognition.positions) ||
      recognition.positions.length !== recognition.detectedCards.length ||
      !recognition.positions.every((position) => validShortText(position) && position.trim()))
  ) return false;
  if (recognition.deckType !== undefined && !validShortText(recognition.deckType)) return false;
  if (recognition.spreadType !== undefined && !validShortText(recognition.spreadType)) return false;
  if (
    recognition.confidence !== undefined &&
    !["high", "medium", "low", "unknown"].includes(recognition.confidence)
  ) return false;
  return true;
}

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
  if (d.recognized !== undefined && !validRecognition(d.recognized)) return false;
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
    if (!raw) return null;
    if (raw.length > MAX_BASE64_LENGTH + 30_000) {
      storage.removeItem(PHOTO_AUTH_DRAFT_KEY);
      return null;
    }
    const d = JSON.parse(raw);
    const expiresAt = d?.expiresAt;
    if (!validDraft(d) || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + PHOTO_AUTH_DRAFT_TTL_MS) {
      storage.removeItem(PHOTO_AUTH_DRAFT_KEY);
      return null;
    }
    // Whitelist fields: browser state cannot restore a session, balance, or free flag.
    return {
      mode: d.mode,
      masterId: d.masterId,
      question: d.question,
      ...(d.image ? { image: { base64: d.image.base64, mimeType: d.image.mimeType } } : {}),
      ...(d.recognized ? {
        recognized: {
          detectedCards: [...d.recognized.detectedCards],
          ...(d.recognized.positions ? { positions: [...d.recognized.positions] } : {}),
          ...(d.recognized.deckType ? { deckType: d.recognized.deckType } : {}),
          ...(d.recognized.spreadType ? { spreadType: d.recognized.spreadType } : {}),
          ...(d.recognized.confidence ? { confidence: d.recognized.confidence } : {}),
        },
      } : {}),
    };
  } catch {
    try {
      storage.removeItem(PHOTO_AUTH_DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
    return null;
  }
}

/** Clear the handoff only after interpretation has started successfully or the user resets it. */
export function clearPhotoAuthDraft(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(PHOTO_AUTH_DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Remove malformed/expired photo data and return how long a valid draft may remain. */
export function enforcePhotoAuthDraftExpiry(storage: DraftStorage, now = Date.now()): number | null {
  try {
    const raw = storage.getItem(PHOTO_AUTH_DRAFT_KEY);
    if (!raw) return null;
    if (raw.length > MAX_BASE64_LENGTH + 30_000) {
      storage.removeItem(PHOTO_AUTH_DRAFT_KEY);
      return null;
    }
    const draft = JSON.parse(raw);
    const expiresAt = draft?.expiresAt;
    if (
      !validDraft(draft) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      expiresAt > now + PHOTO_AUTH_DRAFT_TTL_MS
    ) {
      storage.removeItem(PHOTO_AUTH_DRAFT_KEY);
      return null;
    }
    return expiresAt - now;
  } catch {
    try {
      storage.removeItem(PHOTO_AUTH_DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
    return null;
  }
}
