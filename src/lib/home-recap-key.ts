export type HomeRecapSource = "daily" | "guest_intro" | "triplet" | "unknown";

export function buildHomeRecapKey(input: {
  source: HomeRecapSource;
  historyId?: string | null;
  sessionId?: string | null;
  cardsKey?: string | null;
}): string {
  if (input.historyId?.trim()) return `${input.source}:h:${input.historyId.trim()}`;
  if (input.sessionId?.trim()) return `${input.source}:s:${input.sessionId.trim()}`;
  if (input.cardsKey?.trim()) return `${input.source}:c:${input.cardsKey.trim()}`;
  return `${input.source}:unknown`;
}

export function readHomeRecapHiddenKey(
  astroMeta: Record<string, unknown> | null | undefined
): string | null {
  const raw = astroMeta?.homeRecapHiddenKey;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

type ParsedHomeRecapKey = {
  source: string;
  kind: "h" | "s" | "c";
  id: string;
};

function parseHomeRecapKey(key: string): ParsedHomeRecapKey | null {
  const m = key.trim().match(/^([a-z_]+):(h|s|c):(.+)$/i);
  if (!m) return null;
  return {
    source: m[1].toLowerCase(),
    kind: m[2].toLowerCase() as "h" | "s" | "c",
    id: m[3],
  };
}

/** Extract cardsKey segment from a recap key (`source:c:KEY`). */
export function cardsKeyFromHomeRecapKey(key: string | null | undefined): string | null {
  if (!key?.trim()) return null;
  const parsed = parseHomeRecapKey(key);
  if (!parsed || parsed.kind !== "c") return null;
  return parsed.id;
}

/**
 * True when a candidate recap key is the one the user dismissed from home.
 * Exact id match wins. CardsKey match only bridges unknown/guest_intro/triplet
 * identities — never hides a daily artifact via an intro hide key.
 */
export function isHomeRecapHidden(
  candidateKey: string | null | undefined,
  hiddenKey: string | null | undefined
): boolean {
  if (!candidateKey?.trim() || !hiddenKey?.trim()) return false;
  if (candidateKey.trim() === hiddenKey.trim()) return true;
  const a = parseHomeRecapKey(candidateKey);
  const b = parseHomeRecapKey(hiddenKey);
  if (!a || !b) return false;
  if (a.kind !== "c" || b.kind !== "c" || a.id !== b.id) return false;
  if (a.source === "daily" || b.source === "daily") {
    return a.source === "daily" && b.source === "daily";
  }
  return true;
}
