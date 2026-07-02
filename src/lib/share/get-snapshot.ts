import { query } from "@/lib/db";
import { enrichShareExcerpt } from "./resolve-excerpt";
import { stripLegacyPrivateFields, toPublicPayload } from "./public-payload";
import type { ShareKind, ShareSnapshot, ShareSnapshotPayload, ShareSourceMeta } from "./types";

interface ShareRow {
  id: string;
  token: string;
  user_id: string | null;
  kind: ShareKind;
  payload: ShareSnapshotPayload | Record<string, unknown>;
  source_meta: ShareSourceMeta | null;
  view_count: number;
  expires_at: string | null;
  created_at: string;
}

function normalizePayload(raw: ShareRow["payload"]): ShareSnapshotPayload {
  if (!raw || typeof raw !== "object") {
    return { kind: "reading", title: "Расклад Zovus", excerpt: "" };
  }
  const hasPrivateFields =
    "sessionId" in raw || "historyId" in raw || "sourceType" in raw || "sourceId" in raw;
  if (hasPrivateFields) {
    const stripped = stripLegacyPrivateFields(raw as Record<string, unknown>);
    return { ...stripped, legacySnapshot: true };
  }
  return raw as ShareSnapshotPayload;
}

function mapRow(row: ShareRow): ShareSnapshot {
  return {
    id: row.id,
    token: row.token,
    userId: row.user_id,
    kind: row.kind,
    payload: normalizePayload(row.payload),
    sourceMeta: row.source_meta,
    viewCount: row.view_count,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

async function maybeRehydrateLegacySnapshot(snapshot: ShareSnapshot): Promise<ShareSnapshot> {
  const meta = snapshot.sourceMeta;
  if (!meta || meta.rehydrated || !snapshot.userId) return snapshot;
  if (!meta.sessionId && !meta.historyId) return snapshot;

  const input = {
    kind: snapshot.kind,
    title: snapshot.payload.title,
    excerpt: snapshot.payload.excerpt,
    masterKey: snapshot.payload.masterKey,
    sessionId: meta.sessionId,
    historyId: meta.historyId,
    sourceType: meta.sourceType,
    sourceId: meta.sourceId,
  };

  const { payload: enriched, excerptTruncated } = await enrichShareExcerpt(input, snapshot.userId);
  const currentLen = snapshot.payload.excerpt?.length ?? 0;
  const newLen = enriched.excerpt?.length ?? 0;

  if (newLen <= currentLen) return snapshot;

  const payload = toPublicPayload(enriched, {
    excerptTruncated,
    legacySnapshot: snapshot.payload.legacySnapshot,
  });

  await query(
    `UPDATE share_snapshots
     SET payload = $2,
         source_meta = COALESCE(source_meta, '{}'::jsonb) || '{"rehydrated":true}'::jsonb
     WHERE token = $1`,
    [snapshot.token, JSON.stringify(payload)]
  );

  return { ...snapshot, payload, sourceMeta: { ...meta, rehydrated: true } };
}

export async function getShareSnapshotByToken(
  token: string,
  incrementView = false
): Promise<ShareSnapshot | null> {
  let rows: ShareRow[];
  try {
    ({ rows } = await query<ShareRow>(
      `SELECT id, token, user_id, kind, payload, source_meta, view_count, expires_at, created_at
       FROM share_snapshots WHERE token = $1`,
      [token]
    ));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "42703") throw err;
    ({ rows } = await query<ShareRow>(
      `SELECT id, token, user_id, kind, payload, view_count, expires_at, created_at
       FROM share_snapshots WHERE token = $1`,
      [token]
    ));
  }
  const row = rows[0];
  if (!row || isExpired(row.expires_at)) return null;

  if (incrementView) {
    await query(`UPDATE share_snapshots SET view_count = view_count + 1 WHERE token = $1`, [token]);
    row.view_count += 1;
  }

  let snapshot = mapRow(row);
  if (snapshot.payload.legacySnapshot || (snapshot.payload.excerpt?.length ?? 0) <= 1100) {
    snapshot = await maybeRehydrateLegacySnapshot(snapshot);
  }

  return snapshot;
}

export async function getShareSnapshotPublic(token: string): Promise<ShareSnapshot | null> {
  return getShareSnapshotByToken(token, true);
}
