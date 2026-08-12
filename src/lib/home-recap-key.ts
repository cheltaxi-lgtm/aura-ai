export type HomeRecapSource = "daily" | "guest_intro" | "triplet" | "unknown";

/**
 * Stable home-dismissal identity.
 * Prefer durable DB ids so a reading stays hidden after the 24h window
 * even if display source label changes (daily → historical triplet).
 */
export function buildHomeRecapKey(input: {
  source?: HomeRecapSource;
  historyId?: string | null;
  sessionId?: string | null;
  cardsKey?: string | null;
}): string {
  if (input.historyId?.trim()) return `history:${input.historyId.trim()}`;
  if (input.sessionId?.trim()) return `session:${input.sessionId.trim()}`;
  if (input.cardsKey?.trim()) {
    const source = input.source ?? "unknown";
    return `${source}:c:${input.cardsKey.trim()}`;
  }
  return `${input.source ?? "unknown"}:unknown`;
}

export function readHomeRecapHiddenKey(
  astroMeta: Record<string, unknown> | null | undefined
): string | null {
  const raw = astroMeta?.homeRecapHiddenKey;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

type ArtifactRef =
  | { kind: "history"; id: string }
  | { kind: "session"; id: string }
  | { kind: "cards"; id: string; source: string };

function parseArtifactRef(key: string): ArtifactRef | null {
  const trimmed = key.trim();
  const modern = trimmed.match(/^(history|session):(.+)$/i);
  if (modern) {
    return {
      kind: modern[1].toLowerCase() as "history" | "session",
      id: modern[2],
    };
  }
  // Legacy: daily:h:<id> / guest_intro:s:<id> / *:c:<cardsKey>
  const legacy = trimmed.match(/^([a-z_]+):(h|s|c):(.+)$/i);
  if (!legacy) return null;
  const source = legacy[1].toLowerCase();
  const kind = legacy[2].toLowerCase();
  const id = legacy[3];
  if (kind === "h") return { kind: "history", id };
  if (kind === "s") return { kind: "session", id };
  return { kind: "cards", id, source };
}

/** Extract cardsKey segment from a recap key (`source:c:KEY`). */
export function cardsKeyFromHomeRecapKey(key: string | null | undefined): string | null {
  if (!key?.trim()) return null;
  const parsed = parseArtifactRef(key);
  if (!parsed || parsed.kind !== "cards") return null;
  return parsed.id;
}

/**
 * True when a candidate recap key is the one the user dismissed from home.
 * History/session ids match across legacy and modern prefixes.
 * CardsKey match only bridges non-daily intro/triplet identities.
 */
export function isHomeRecapHidden(
  candidateKey: string | null | undefined,
  hiddenKey: string | null | undefined
): boolean {
  if (!candidateKey?.trim() || !hiddenKey?.trim()) return false;
  if (candidateKey.trim() === hiddenKey.trim()) return true;
  const a = parseArtifactRef(candidateKey);
  const b = parseArtifactRef(hiddenKey);
  if (!a || !b) return false;
  if (a.kind === "history" && b.kind === "history") return a.id === b.id;
  if (a.kind === "session" && b.kind === "session") return a.id === b.id;
  if (a.kind === "cards" && b.kind === "cards" && a.id === b.id) {
    if (a.source === "daily" || b.source === "daily") {
      return a.source === "daily" && b.source === "daily";
    }
    return true;
  }
  return false;
}
