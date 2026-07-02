import { sanitizeSharePayload } from "./sanitize";
import type { SharePayload, SharePublicPayload, ShareSourceMeta } from "./types";

const PRIVATE_KEYS = new Set([
  "sessionId",
  "historyId",
  "sourceType",
  "sourceId",
]);

export function extractShareSourceMeta(input: SharePayload): ShareSourceMeta {
  const sourceType =
    input.sourceType ??
    (input.sessionId ? "session" : input.historyId ? "history" : input.kind === "daily" ? "daily" : input.kind === "ritual" ? "ritual" : input.kind === "triplet" ? "triplet" : "inline");

  const sourceId =
    input.sourceId ??
    input.sessionId ??
    input.historyId ??
    undefined;

  return {
    sourceType,
    sourceId,
    sessionId: input.sessionId,
    historyId: input.historyId,
  };
}

export function toPublicPayload(
  input: SharePayload,
  opts?: { excerptTruncated?: boolean; legacySnapshot?: boolean }
): SharePublicPayload {
  const sanitized = sanitizeSharePayload(input);
  const publicFields: SharePublicPayload = {
    kind: sanitized.kind,
    title: sanitized.title ?? "Расклад Zovus",
    excerpt: sanitized.excerpt ?? "",
    masterKey: sanitized.masterKey,
    masterName: sanitized.masterName,
    userName: sanitized.userName,
    cards: sanitized.cards,
    deckSystem: sanitized.deckSystem,
    spreadId: sanitized.spreadId,
    spreadType: sanitized.spreadType,
    date: sanitized.date,
    ritualType: sanitized.ritualType,
    ritualLabel: sanitized.ritualLabel,
    moonPhase: sanitized.moonPhase,
    moonSign: sanitized.moonSign,
  };

  if (opts?.excerptTruncated) publicFields.excerptTruncated = true;
  if (opts?.legacySnapshot) publicFields.legacySnapshot = true;

  return publicFields;
}

/** Strip private fields accidentally stored in legacy snapshots. */
export function stripLegacyPrivateFields(raw: Record<string, unknown>): SharePublicPayload {
  const cleaned: Record<string, unknown> = { ...raw };
  for (const key of PRIVATE_KEYS) {
    delete cleaned[key];
  }
  if (typeof cleaned.excerpt !== "string") cleaned.excerpt = "";
  if (typeof cleaned.title !== "string") cleaned.title = "Расклад Zovus";
  if (typeof cleaned.kind !== "string") cleaned.kind = "reading";
  return cleaned as unknown as SharePublicPayload;
}

/** Public API response — never includes sourceMeta or private IDs. */
export interface SharePublicApiResponse {
  token: string;
  kind: SharePublicPayload["kind"];
  payload: SharePublicPayload;
  viewCount: number;
  createdAt: string;
  expiresAt: string | null;
}

export function toSharePublicApiResponse(input: {
  token: string;
  kind: SharePublicPayload["kind"];
  payload: SharePublicPayload | Record<string, unknown>;
  viewCount: number;
  createdAt: string;
  expiresAt: string | null;
}): SharePublicApiResponse {
  const payload =
    "sessionId" in input.payload ||
    "historyId" in input.payload ||
    "sourceType" in input.payload ||
    "sourceId" in input.payload
      ? stripLegacyPrivateFields(input.payload as Record<string, unknown>)
      : (input.payload as SharePublicPayload);

  return {
    token: input.token,
    kind: input.kind,
    payload,
    viewCount: input.viewCount,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  };
}
