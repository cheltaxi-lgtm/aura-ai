import { query } from "./db";
import type { AstroMeta, LifeFocus } from "./astro-profile";
import { buildAstroMeta } from "./astro-profile";
import { tarotCardsKey } from "./tarot";

export interface UserRow {
  id: string;
  name: string;
  gender: "male" | "female";
  birth_date: string;
  zodiac: string;
  birth_time: string | null;
  birth_city: string | null;
  life_focus: LifeFocus | null;
  main_question: string | null;
  astro_meta: AstroMeta | Record<string, unknown>;
  created_at: Date;
}

export interface CreateUserProfileInput {
  name: string;
  gender: "male" | "female";
  birthDate: string;
  zodiac: string;
  birthTime?: string;
  birthCity?: string;
  lifeFocus?: LifeFocus;
  mainQuestion?: string;
  astroMeta?: AstroMeta;
}

const USER_COLUMNS = `id, name, gender, birth_date::text, zodiac,
  birth_time::text, birth_city, life_focus, main_question, astro_meta, created_at`;

export async function createUserProfile(data: CreateUserProfileInput): Promise<UserRow> {
  const { rows } = await query<UserRow>(
    `INSERT INTO users (
      name, gender, birth_date, zodiac,
      birth_time, birth_city, life_focus, main_question, astro_meta
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${USER_COLUMNS}`,
    [
      data.name.trim(),
      data.gender,
      data.birthDate,
      data.zodiac,
      data.birthTime ?? null,
      data.birthCity ?? null,
      data.lifeFocus ?? "general",
      data.mainQuestion ?? null,
      JSON.stringify(data.astroMeta ?? {}),
    ]
  );
  return rows[0];
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updateUserProfile(
  id: string,
  data: CreateUserProfileInput
): Promise<UserRow | null> {
  const current = await getUserById(id);
  if (!current) return null;

  const astroMeta = data.astroMeta ?? buildAstroMeta(data.birthDate) ?? current.astro_meta;

  const { rows } = await query<UserRow>(
    `UPDATE users SET
      name = $2,
      gender = $3,
      birth_date = $4,
      zodiac = $5,
      birth_time = $6,
      birth_city = $7,
      life_focus = $8,
      main_question = $9,
      astro_meta = $10
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [
      id,
      data.name.trim(),
      data.gender,
      data.birthDate,
      data.zodiac,
      data.birthTime ?? null,
      data.birthCity ?? null,
      data.lifeFocus ?? "general",
      data.mainQuestion ?? null,
      JSON.stringify(astroMeta),
    ]
  );
  return rows[0] ?? null;
}

export async function linkSessionToUser(sessionId: string, profileUserId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `UPDATE sessions AS s
     SET user_id = u.id, updated_at = NOW()
     FROM users u
     WHERE s.id = $1 AND u.id = $2
     RETURNING s.id`,
    [sessionId, profileUserId]
  );
  return Boolean(rows[0]);
}

/** Attach session to profile only when both rows exist in DB. */
export async function attachSessionToProfile(
  sessionId: string | undefined,
  profileUserId: string | undefined
): Promise<boolean> {
  if (!sessionId || !profileUserId) return false;
  return linkSessionToUser(sessionId, profileUserId);
}

export async function createHistoryEntry(data: {
  userId: string;
  characterName: string;
  contextData: Record<string, unknown>;
  isPaid?: boolean;
}) {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO history (user_id, character_name, context_data, is_paid)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [data.userId, data.characterName, JSON.stringify(data.contextData), data.isPaid ?? false]
  );
  return rows[0];
}

export async function getLatestHistoryEntry(
  userId: string,
  opts?: { characterName?: string; contextType?: string }
): Promise<{ id: string; context_data: Record<string, unknown>; created_at: Date } | null> {
  const params: unknown[] = [userId];
  let sql = `SELECT id, context_data, created_at FROM history WHERE user_id = $1`;

  if (opts?.characterName) {
    params.push(opts.characterName);
    sql += ` AND character_name = $${params.length}`;
  }
  if (opts?.contextType) {
    params.push(opts.contextType);
    sql += ` AND context_data->>'type' = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC LIMIT 1`;

  const { rows } = await query<{ id: string; context_data: Record<string, unknown>; created_at: Date }>(
    sql,
    params
  );
  return rows[0] ?? null;
}

export async function patchHistorySceneArt(
  userId: string,
  entryId: string,
  scene: string,
  imageUrl: string
): Promise<boolean> {
  const result = await query(
    `UPDATE history SET context_data = jsonb_set(
       COALESCE(context_data, '{}'::jsonb),
       '{sceneArt}',
       COALESCE(context_data->'sceneArt', '{}'::jsonb) || jsonb_build_object($3::text, $4::text),
       true
     )
     WHERE id = $1 AND user_id = $2`,
    [entryId, userId, scene, imageUrl]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function resolveHistoryEntryForSceneArt(
  userId: string,
  scene: string
): Promise<string | null> {
  if (scene === "tarot_atmosphere" || scene === "zodiac_avatar") {
    return (await getLatestHistoryEntry(userId, { characterName: "triplet" }))?.id ?? null;
  }
  if (scene === "destiny_card") {
    return (
      (await getLatestHistoryEntry(userId, { contextType: "reading" }))?.id ??
      (await getLatestHistoryEntry(userId, { characterName: "triplet" }))?.id ??
      null
    );
  }
  if (scene === "final_report") {
    return (await getLatestHistoryEntry(userId, { characterName: "triplet" }))?.id ?? null;
  }
  return null;
}

export async function setHistoryPaid(userId: string, isPaid: boolean) {
  await query(
    `UPDATE history SET is_paid = $2 WHERE user_id = $1 AND is_paid = FALSE`,
    [userId, isPaid]
  );
}

export async function incrementHistoryQuestions(userId: string) {
  await query(
    `UPDATE history SET free_question_count = free_question_count + 1
     WHERE id = (
       SELECT id FROM history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
     )`,
    [userId]
  );
}

export async function deleteHistoryEntry(userId: string, entryId: string): Promise<boolean> {
  const { rows } = await query<{ character_name: string; created_at: Date; context_data: Record<string, unknown> }>(
    `SELECT character_name, created_at, context_data FROM history WHERE id = $1 AND user_id = $2`,
    [entryId, userId]
  );
  const entry = rows[0];

  const result = await query(
    "DELETE FROM history WHERE id = $1 AND user_id = $2",
    [entryId, userId]
  );

  if ((result.rowCount ?? 0) > 0 && entry?.created_at) {
    const isTripletDraw =
      entry.character_name === "triplet" ||
      (entry.context_data as Record<string, unknown> | undefined)?.type === "triplet";
    if (isTripletDraw) {
      await recordTripletDrawAnchor(userId, entry.created_at);
    }
  }

  return (result.rowCount ?? 0) > 0;
}

export async function recordTripletDrawAnchor(
  userId: string,
  at: Date | string = new Date()
): Promise<void> {
  const iso = at instanceof Date ? at.toISOString() : at;
  await query(
    `UPDATE users SET astro_meta = jsonb_set(
       COALESCE(astro_meta, '{}'::jsonb),
       '{lastTripletDrawAt}',
       to_jsonb($2::text),
       true
     )
     WHERE id = $1`,
    [userId, iso]
  );
}

export function serializeUserProfile(user: UserRow) {
  return {
    id: user.id,
    name: user.name,
    gender: user.gender,
    birthDate: user.birth_date,
    zodiac: user.zodiac,
    birthTime: user.birth_time,
    birthCity: user.birth_city,
    lifeFocus: user.life_focus,
    mainQuestion: user.main_question,
    astroMeta: user.astro_meta,
  };
}
export function canPersistSceneUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/api/scene-art/") ||
    trimmed.startsWith("/scene-art/")
  );
}

export async function persistSceneArtForSpread(
  userId: string,
  scene: string,
  imageUrl: string,
  opts: { cardsKey?: string; characterId?: string } = {}
): Promise<number> {
  if (!canPersistSceneUrl(imageUrl)) return 0;

  const { rows } = await query<{
    id: string;
    character_name: string;
    context_data: Record<string, unknown>;
  }>(
    `SELECT id, character_name, context_data
     FROM history
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 80`,
    [userId]
  );

  const { cardsKey, characterId } = opts;
  const idsToPatch = new Set<string>();

  for (const row of rows) {
    const ctx = row.context_data ?? {};
    const rowCardsKey = tarotCardsKey(ctx.tarotCards as { name: string }[] | undefined);

    if (scene === "destiny_card") {
      if (row.character_name === "triplet") {
        if (!cardsKey || rowCardsKey === cardsKey) idsToPatch.add(row.id);
        continue;
      }
      if (ctx.type === "reading") {
        if (characterId && row.character_name !== characterId) continue;
        if (cardsKey && rowCardsKey && rowCardsKey !== cardsKey) continue;
        idsToPatch.add(row.id);
      }
      continue;
    }

    if (cardsKey && rowCardsKey !== cardsKey) continue;

    if (
      scene === "tarot_atmosphere" ||
      scene === "zodiac_avatar" ||
      scene === "final_report"
    ) {
      if (row.character_name === "triplet") {
        idsToPatch.add(row.id);
      }
    }
  }

  if (idsToPatch.size === 0) return 0;

  const results = await Promise.all(
    [...idsToPatch].map((id) => patchHistorySceneArt(userId, id, scene, imageUrl))
  );
  return results.filter(Boolean).length;
}

/** Return an already persisted scene art URL for this user/spread (skip regeneration). */
export async function findExistingSceneArtUrl(
  userId: string,
  scene: string,
  cardsKey?: string
): Promise<string | null> {
  const { rows } = await query<{
    character_name: string;
    context_data: Record<string, unknown>;
  }>(
    `SELECT character_name, context_data
     FROM history
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 80`,
    [userId]
  );

  for (const row of rows) {
    const ctx = row.context_data ?? {};
    const sceneArt = ctx.sceneArt as Record<string, string> | undefined;
    const url = sceneArt?.[scene];
    if (!url?.trim()) continue;

    if (cardsKey) {
      const rowKey = tarotCardsKey(ctx.tarotCards as { name: string }[] | undefined);
      if (rowKey && rowKey !== cardsKey) continue;
    }

    return url;
  }

  return null;
}

/** Attach master interpretation snapshot to the triplet row (stable cabinet display). */
export async function patchTripletInterpretation(
  userId: string,
  cardsKey: string,
  payload: { text: string; masterId: string }
): Promise<boolean> {
  if (!cardsKey) return false;

  const { rows } = await query<{ id: string; context_data: Record<string, unknown> }>(
    `SELECT id, context_data
     FROM history
     WHERE user_id = $1 AND character_name = 'triplet'
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  );

  const triplet = rows.find(
    (r) => tarotCardsKey(r.context_data?.tarotCards as { name: string }[] | undefined) === cardsKey
  );
  if (!triplet) return false;

  const interpretation = {
    text: payload.text,
    masterId: payload.masterId,
    savedAt: new Date().toISOString(),
  };

  const result = await query(
    `UPDATE history SET context_data = jsonb_set(
       COALESCE(context_data, '{}'::jsonb),
       '{interpretation}',
       $3::jsonb,
       true
     )
     WHERE id = $1 AND user_id = $2`,
    [triplet.id, userId, JSON.stringify(interpretation)]
  );
  return (result.rowCount ?? 0) > 0;
}
