import { query, queryClient, type PoolClient } from "@/lib/db";
import { AURA_CADENCE_TZ } from "@/lib/aura-cadence";
import { auraSubjectNameKey } from "@/lib/aura-subject-name";
import { normalizeStoredDisplayName } from "@/lib/normalize-person-name";
import { isAuraOtherSubjectsEnabled } from "@/lib/settings";

export { auraSubjectNameKey };

const AURA_TODAY_PREDICATE = `(created_at AT TIME ZONE '${AURA_CADENCE_TZ}')::date = (NOW() AT TIME ZONE '${AURA_CADENCE_TZ}')::date`;

export type AuraSubjectKind = "self" | "other";

export type AuraSubject = {
  id: string;
  kind: AuraSubjectKind;
  displayName: string;
  shotToday: boolean;
  lastColorKey: string | null;
  lastColorName: string | null;
};

function asSubject(row: {
  id: string;
  kind: string;
  display_name: string;
  shot_today?: boolean;
  last_color_key?: string | null;
  last_color_name?: string | null;
}): AuraSubject {
  return {
    id: row.id,
    kind: row.kind === "other" ? "other" : "self",
    displayName: row.display_name,
    shotToday: row.shot_today === true,
    lastColorKey: row.last_color_key ?? null,
    lastColorName: row.last_color_name ?? null,
  };
}

async function run<T extends Record<string, unknown>>(
  client: PoolClient | undefined,
  text: string,
  params?: unknown[]
) {
  return client ? queryClient<T>(client, text, params) : query<T>(text, params);
}

export async function ensureAuraSelfSubject(
  userId: string,
  client?: PoolClient
): Promise<AuraSubject> {
  const existing = await run<{ id: string; kind: string; display_name: string }>(
    client,
    `SELECT id, kind, display_name FROM aura_subjects
     WHERE user_id = $1 AND kind = 'self' LIMIT 1`,
    [userId]
  );
  if (existing.rows[0]) return asSubject(existing.rows[0]);

  const inserted = await run<{ id: string; kind: string; display_name: string }>(
    client,
    `INSERT INTO aura_subjects (user_id, kind, display_name, name_key)
     VALUES ($1, 'self', 'Я', 'self')
     ON CONFLICT DO NOTHING
     RETURNING id, kind, display_name`,
    [userId]
  );
  if (inserted.rows[0]) return asSubject(inserted.rows[0]);

  const again = await run<{ id: string; kind: string; display_name: string }>(
    client,
    `SELECT id, kind, display_name FROM aura_subjects
     WHERE user_id = $1 AND kind = 'self' LIMIT 1`,
    [userId]
  );
  if (!again.rows[0]) throw new Error("AURA_SELF_SUBJECT_FAILED");
  return asSubject(again.rows[0]);
}

export async function findAuraSubjectByName(
  userId: string,
  rawName: string
): Promise<AuraSubject | null> {
  const key = auraSubjectNameKey(rawName);
  if (!key || key === "self" || key === "я") return null;
  const { rows } = await query<{ id: string; kind: string; display_name: string }>(
    `SELECT id, kind, display_name FROM aura_subjects
     WHERE user_id = $1 AND kind = 'other' AND name_key = $2
     LIMIT 1`,
    [userId, key]
  );
  return rows[0] ? asSubject(rows[0]) : null;
}

export async function getAuraSubjectForUser(
  userId: string,
  subjectId: string
): Promise<AuraSubject | null> {
  const { rows } = await query<{ id: string; kind: string; display_name: string }>(
    `SELECT id, kind, display_name FROM aura_subjects
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [subjectId, userId]
  );
  return rows[0] ? asSubject(rows[0]) : null;
}

export async function ensureAuraOtherSubject(
  userId: string,
  rawName: string,
  client?: PoolClient
): Promise<AuraSubject> {
  const displayName = normalizeStoredDisplayName(rawName, "");
  const key = auraSubjectNameKey(displayName);
  if (!displayName || !key || key === "self" || key === "я") {
    throw new Error("AURA_NAME_REQUIRED");
  }

  const existing = await run<{ id: string; kind: string; display_name: string }>(
    client,
    `SELECT id, kind, display_name FROM aura_subjects
     WHERE user_id = $1 AND kind = 'other' AND name_key = $2
     LIMIT 1`,
    [userId, key]
  );
  if (existing.rows[0]) return asSubject(existing.rows[0]);

  const inserted = await run<{ id: string; kind: string; display_name: string }>(
    client,
    `INSERT INTO aura_subjects (user_id, kind, display_name, name_key)
     VALUES ($1, 'other', $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING id, kind, display_name`,
    [userId, displayName, key]
  );
  if (inserted.rows[0]) return asSubject(inserted.rows[0]);

  const again = await run<{ id: string; kind: string; display_name: string }>(
    client,
    `SELECT id, kind, display_name FROM aura_subjects
     WHERE user_id = $1 AND kind = 'other' AND name_key = $2
     LIMIT 1`,
    [userId, key]
  );
  if (!again.rows[0]) throw new Error("AURA_OTHER_SUBJECT_FAILED");
  return asSubject(again.rows[0]);
}

export async function listAuraSubjects(userId: string): Promise<AuraSubject[]> {
  await ensureAuraSelfSubject(userId);
  const { rows } = await query<{
    id: string;
    kind: string;
    display_name: string;
    shot_today: boolean;
    last_color_key: string | null;
    last_color_name: string | null;
  }>(
    `SELECT sub.id, sub.kind, sub.display_name,
            EXISTS (
              SELECT 1 FROM aura_guest_snapshots s
              WHERE s.claimed_user_id = $1
                AND s.subject_id = sub.id
                AND ${AURA_TODAY_PREDICATE}
            ) AS shot_today,
            (
              SELECT s.snapshot->'dominantColor'->>'key'
              FROM aura_guest_snapshots s
              WHERE s.claimed_user_id = $1 AND s.subject_id = sub.id
              ORDER BY s.created_at DESC
              LIMIT 1
            ) AS last_color_key,
            (
              SELECT s.snapshot->'dominantColor'->>'name'
              FROM aura_guest_snapshots s
              WHERE s.claimed_user_id = $1 AND s.subject_id = sub.id
              ORDER BY s.created_at DESC
              LIMIT 1
            ) AS last_color_name
     FROM aura_subjects sub
     WHERE sub.user_id = $1
     ORDER BY CASE WHEN sub.kind = 'self' THEN 0 ELSE 1 END, sub.created_at ASC`,
    [userId]
  );
  return rows.map(asSubject);
}

export async function countTodaysOtherTeasers(userId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM aura_guest_snapshots s
     WHERE s.claimed_user_id = $1
       AND s.subject_kind = 'other'
       AND ${AURA_TODAY_PREDICATE}`,
    [userId]
  );
  return Number.parseInt(rows[0]?.count ?? "0", 10) || 0;
}

export async function findSimilarColorSubject(opts: {
  userId: string;
  colorKey: string;
  excludeSubjectId?: string | null;
}): Promise<{ displayName: string } | null> {
  const { rows } = await query<{ display_name: string }>(
    `SELECT sub.display_name
     FROM aura_subjects sub
     JOIN LATERAL (
       SELECT s.snapshot
       FROM aura_guest_snapshots s
       WHERE s.claimed_user_id = $1 AND s.subject_id = sub.id
       ORDER BY s.created_at DESC
       LIMIT 1
     ) latest ON TRUE
     WHERE sub.user_id = $1
       AND sub.kind = 'other'
       AND ($3::uuid IS NULL OR sub.id <> $3)
       AND latest.snapshot->'dominantColor'->>'key' = $2
     LIMIT 1`,
    [opts.userId, opts.colorKey, opts.excludeSubjectId ?? null]
  );
  return rows[0] ? { displayName: rows[0].display_name } : null;
}

export async function resolveAuraSubjectScope(opts: {
  userId: string;
  subjectId?: string | null;
  kind?: string | null;
  subjectName?: string | null;
}): Promise<
  | { ok: true; subject: AuraSubject }
  | { ok: false; code: "NAME_REQUIRED" | "NAME_EXISTS" | "NOT_FOUND"; subject?: AuraSubject }
> {
  if (!(await isAuraOtherSubjectsEnabled())) {
    const self = await ensureAuraSelfSubject(opts.userId);
    return { ok: true, subject: self };
  }

  if (opts.subjectId) {
    const found = await getAuraSubjectForUser(opts.userId, opts.subjectId);
    if (!found) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, subject: found };
  }

  if (opts.kind === "other") {
    const name = (opts.subjectName ?? "").trim();
    if (!name) return { ok: false, code: "NAME_REQUIRED" };
    const existing = await findAuraSubjectByName(opts.userId, name);
    if (existing) return { ok: false, code: "NAME_EXISTS", subject: existing };
    // New slot is created only after a successful face — not here.
    return { ok: false, code: "NOT_FOUND" };
  }

  const self = await ensureAuraSelfSubject(opts.userId);
  return { ok: true, subject: self };
}
