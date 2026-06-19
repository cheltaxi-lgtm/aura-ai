export type TtsCacheEntry =
  | {
      kind: "blob";
      blob: Blob;
      contentType: string;
      provider?: string;
      objectUrl: string;
    }
  | {
      kind: "multipart";
      parts: string[];
      contentType: string;
      provider?: string;
    };

const memory = new Map<string, TtsCacheEntry>();
const SESSION_PREFIX = "aura_tts_v1_";
const SESSION_MAX_BYTES = 350_000;

export function ttsCacheKey(characterId: string, text: string): string {
  const normalized = text.trim();
  if (normalized.length <= 400) return `${characterId}::${normalized}`;

  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  return `${characterId}::${normalized.length}::${(hash >>> 0).toString(36)}`;
}

function sessionStorageKey(cacheKey: string): string {
  let hash = 0;
  for (let i = 0; i < cacheKey.length; i++) {
    hash = (hash * 31 + cacheKey.charCodeAt(i)) | 0;
  }
  return `${SESSION_PREFIX}${(hash >>> 0).toString(36)}`;
}

function readSession(cacheKey: string): TtsCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(sessionStorageKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      kind: "blob" | "multipart";
      contentType: string;
      provider?: string;
      base64?: string;
      parts?: string[];
    };
    if (parsed.kind === "multipart" && parsed.parts?.length) {
      return {
        kind: "multipart",
        parts: parsed.parts,
        contentType: parsed.contentType,
        provider: parsed.provider,
      };
    }
    if (parsed.kind === "blob" && parsed.base64) {
      const binary = atob(parsed.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: parsed.contentType });
      return {
        kind: "blob",
        blob,
        contentType: parsed.contentType,
        provider: parsed.provider,
        objectUrl: URL.createObjectURL(blob),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeSession(cacheKey: string, entry: TtsCacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    if (entry.kind === "multipart") {
      const payload = JSON.stringify({
        kind: "multipart",
        contentType: entry.contentType,
        provider: entry.provider,
        parts: entry.parts,
      });
      if (payload.length <= SESSION_MAX_BYTES) {
        sessionStorage.setItem(sessionStorageKey(cacheKey), payload);
      }
      return;
    }

    if (entry.blob.size > SESSION_MAX_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        if (!base64) return;
        const payload = JSON.stringify({
          kind: "blob",
          contentType: entry.contentType,
          provider: entry.provider,
          base64,
        });
        if (payload.length <= SESSION_MAX_BYTES * 1.4) {
          sessionStorage.setItem(sessionStorageKey(cacheKey), payload);
        }
      } catch {
        /* quota */
      }
    };
    reader.readAsDataURL(entry.blob);
  } catch {
    /* ignore */
  }
}

export function getTtsCache(cacheKey: string): TtsCacheEntry | null {
  const hit = memory.get(cacheKey);
  if (hit) return hit;
  const fromSession = readSession(cacheKey);
  if (fromSession) {
    memory.set(cacheKey, fromSession);
    return fromSession;
  }
  return null;
}

export function setTtsCache(cacheKey: string, entry: TtsCacheEntry): void {
  memory.set(cacheKey, entry);
  writeSession(cacheKey, entry);
}

export function hasTtsCache(cacheKey: string): boolean {
  return getTtsCache(cacheKey) !== null;
}
