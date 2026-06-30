import { query } from "@/lib/db";
import type { ShareKind, ShareSnapshot, ShareSnapshotPayload } from "./types";

interface ShareRow {
  id: string;
  token: string;
  user_id: string | null;
  kind: ShareKind;
  payload: ShareSnapshotPayload;
  view_count: number;
  expires_at: string | null;
  created_at: string;
}

function mapRow(row: ShareRow): ShareSnapshot {
  return {
    id: row.id,
    token: row.token,
    userId: row.user_id,
    kind: row.kind,
    payload: row.payload,
    viewCount: row.view_count,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export async function getShareSnapshotByToken(
  token: string,
  incrementView = false
): Promise<ShareSnapshot | null> {
  const { rows } = await query<ShareRow>(
    `SELECT id, token, user_id, kind, payload, view_count, expires_at, created_at
     FROM share_snapshots WHERE token = $1`,
    [token]
  );
  const row = rows[0];
  if (!row || isExpired(row.expires_at)) return null;

  if (incrementView) {
    await query(`UPDATE share_snapshots SET view_count = view_count + 1 WHERE token = $1`, [token]);
    row.view_count += 1;
  }

  return mapRow(row);
}

export async function getShareSnapshotPublic(token: string): Promise<ShareSnapshot | null> {
  return getShareSnapshotByToken(token, true);
}
