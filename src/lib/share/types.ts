export type ShareKind = "reading" | "ritual" | "daily" | "triplet" | "session";

export type ShareChannel = "telegram" | "whatsapp" | "vk" | "copy" | "png" | "native";

export interface ShareCardInput {
  name: string;
  meaning?: string;
  position?: string;
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
}

export interface ShareSnapshotPayload extends SharePayload {
  excerpt: string;
  userName?: string;
}

export interface ShareSnapshot {
  id: string;
  token: string;
  userId: string | null;
  kind: ShareKind;
  payload: ShareSnapshotPayload;
  viewCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreateShareResult {
  token: string;
  url: string;
}
