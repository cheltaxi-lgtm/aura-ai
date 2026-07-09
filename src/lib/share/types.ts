export type ShareKind = "reading" | "ritual" | "daily" | "triplet" | "session" | "joint";

export type ShareSourceType =
  | "session"
  | "history"
  | "daily"
  | "ritual"
  | "triplet"
  | "joint"
  | "inline";

export type ShareChannel = "telegram" | "vk" | "copy" | "native" | "download";

export interface ShareCardInput {
  name: string;
  meaning?: string;
  position?: string;
}

/** Server-only fields for resolving full reading — never exposed publicly. */
export interface ShareSourceMeta {
  sourceType?: ShareSourceType;
  sourceId?: string;
  sessionId?: string;
  historyId?: string;
  rehydrated?: boolean;
}

/** Client payload sent to POST /api/share */
export interface SharePayload {
  kind: ShareKind;
  title: string;
  excerpt?: string;
  masterKey?: string;
  masterName?: string;
  userName?: string;
  cards?: ShareCardInput[];
  deckSystem?: string;
  spreadId?: string;
  spreadType?: string;
  date?: string;
  ritualType?: string;
  ritualLabel?: string;
  moonPhase?: string | null;
  moonSign?: string | null;
  sourceType?: ShareSourceType;
  sourceId?: string;
  sessionId?: string;
  historyId?: string;
}

/** Stored and publicly served snapshot body (no internal IDs). */
export interface SharePublicPayload {
  kind: ShareKind;
  title: string;
  excerpt: string;
  masterKey?: string;
  masterName?: string;
  userName?: string;
  cards?: ShareCardInput[];
  deckSystem?: string;
  spreadId?: string;
  spreadType?: string;
  date?: string;
  ritualType?: string;
  ritualLabel?: string;
  moonPhase?: string | null;
  moonSign?: string | null;
  excerptTruncated?: boolean;
  legacySnapshot?: boolean;
}

export type ShareSnapshotPayload = SharePublicPayload;

export interface ShareSnapshot {
  id: string;
  token: string;
  userId: string | null;
  kind: ShareKind;
  payload: ShareSnapshotPayload;
  sourceMeta: ShareSourceMeta | null;
  viewCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreateShareResult {
  token: string;
  url: string;
  payload: ShareSnapshotPayload;
}
