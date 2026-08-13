import { query, queryClient, withTransaction } from "./db";
import { deleteUserChatForCharacter } from "./accounts";
import type { AstroMeta, LifeFocus } from "./astro-profile";
import { buildAstroMeta } from "./astro-profile";
import { mergeConsentIntoAstroMeta, type AccountConsentSnapshot } from "./registration-consent";
import { normalizeStoredDisplayName } from "./normalize-person-name";
import { clearDailyReadingAnchors } from "./rate-limit-anchors";
import { tarotCardsKey } from "./tarot";

function storedProfileName(name: string): string {
  return normalizeStoredDisplayName(name, name.trim() || "Гость");
}

export interface UserRow {
  id: string;
  name: string;
  gender: "male" | "female";
  /** Null = stub consumer profile (Tarot/chat ok; natal/matrix/HD blocked). */
  birth_date: string | null;
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
  /** Omit / empty → stub profile without birth (migration 124). */
  birthDate?: string | null;
  zodiac?: string;
  birthTime?: string;
  birthCity?: string;
  lifeFocus?: LifeFocus;
  mainQuestion?: string;
  astroMeta?: AstroMeta | Record<string, unknown>;
}

/** True when the profile can power natal / matrix / HD calculations. */
export function profileHasBirthData(
  profile: Pick<UserRow, "birth_date"> | { birthDate?: string | null } | null | undefined
): boolean {
  if (!profile) return false;
  const raw =
    "birth_date" in profile
      ? profile.birth_date
      : "birthDate" in profile
        ? profile.birthDate
        : null;
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw.trim());
}

/**
 * Gender for personalization. Schema still requires male|female, but stubs may
 * store a placeholder with `astro_meta.genderUnspecified` — treat as unknown.
 */
export function profileGenderForPersonalization(
  profile: Pick<UserRow, "gender" | "astro_meta"> | null | undefined
): "male" | "female" | null {
  if (!profile) return null;
  const meta = profile.astro_meta as { genderUnspecified?: boolean } | null | undefined;
  if (meta?.genderUnspecified === true) return null;
  if (profile.gender === "male" || profile.gender === "female") return profile.gender;
  return null;
}

async function loadAccountConsentForStub(
  accountId: string
): Promise<AccountConsentSnapshot | null> {
  // Inline query avoids accounts↔users import cycle.
  const { rows } = await query<{
    terms_accepted_at: Date | null;
    age_confirmed_at: Date | null;
    marketing_consent: boolean;
    marketing_consent_at: Date | null;
  }>(
    `SELECT terms_accepted_at, age_confirmed_at, marketing_consent, marketing_consent_at
     FROM user_accounts WHERE id = $1`,
    [accountId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    termsAcceptedAt: row.terms_accepted_at?.toISOString() ?? null,
    ageConfirmedAt: row.age_confirmed_at?.toISOString() ?? null,
    marketingConsent: Boolean(row.marketing_consent),
    marketingConsentAt: row.marketing_consent_at?.toISOString() ?? null,
  };
}

const USER_COLUMNS = `id, name, gender, birth_date::text, zodiac,
  birth_time::text, birth_city, life_focus, main_question, astro_meta, created_at`;

/** Create profile row and link account in one transaction. */
export async function createUserProfileForAccount(
  accountId: string,
  data: CreateUserProfileInput
): Promise<UserRow> {
  const birthDate =
    typeof data.birthDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(data.birthDate.trim())
      ? data.birthDate.trim().slice(0, 10)
      : null;
  return withTransaction(async (client) => {
    const profileResult = await queryClient<UserRow>(
      client,
      `INSERT INTO users (
        name, gender, birth_date, zodiac,
        birth_time, birth_city, life_focus, main_question, astro_meta
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${USER_COLUMNS}`,
      [
        storedProfileName(data.name),
        data.gender,
        birthDate,
        data.zodiac ?? "",
        data.birthTime ?? null,
        data.birthCity ?? null,
        data.lifeFocus ?? "general",
        data.mainQuestion ?? null,
        JSON.stringify(data.astroMeta ?? {}),
      ]
    );
    const created = profileResult.rows[0];
    if (!created) throw new Error("Failed to create profile");

    const accountResult = await queryClient<{
      id: string;
      profile_user_id: string | null;
    }>(client, "SELECT id, profile_user_id FROM user_accounts WHERE id = $1 FOR UPDATE", [
      accountId,
    ]);
    const account = accountResult.rows[0];
    if (!account) throw new Error("Account not found");
    if (account.profile_user_id && account.profile_user_id !== created.id) {
      throw new Error("PROFILE_OWNERSHIP_CONFLICT");
    }

    const conflict = await queryClient<{ id: string }>(
      client,
      `SELECT id FROM user_accounts
       WHERE profile_user_id = $1 AND id <> $2
       LIMIT 1
       FOR UPDATE`,
      [created.id, accountId]
    );
    if (conflict.rows[0]) throw new Error("PROFILE_OWNERSHIP_CONFLICT");

    await queryClient(
      client,
      "UPDATE user_accounts SET profile_user_id = $2, name = $3 WHERE id = $1",
      [accountId, created.id, created.name]
    );
    return created;
  });
}

export async function createUserProfile(data: CreateUserProfileInput): Promise<UserRow> {
  const birthDate =
    typeof data.birthDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(data.birthDate.trim())
      ? data.birthDate.trim().slice(0, 10)
      : null;
  const { rows } = await query<UserRow>(
    `INSERT INTO users (
      name, gender, birth_date, zodiac,
      birth_time, birth_city, life_focus, main_question, astro_meta
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${USER_COLUMNS}`,
    [
      storedProfileName(data.name),
      data.gender,
      birthDate,
      data.zodiac ?? "",
      data.birthTime ?? null,
      data.birthCity ?? null,
      data.lifeFocus ?? "general",
      data.mainQuestion ?? null,
      JSON.stringify(data.astroMeta ?? {}),
    ]
  );
  return rows[0];
}

/**
 * Idempotent: ensure the account has a consumer profile row so Tarot / claim /
 * chat work without birth onboarding. Does nothing if profile already linked.
 *
 * Age/18+ is copied only from authoritative `user_accounts` consent columns —
 * this helper never invents ageConfirmed=true.
 *
 * Gender: schema requires male|female. Unknown gender stores a schema filler
 * plus `astro_meta.genderUnspecified` so personalization does not treat it as fact.
 */
export async function ensureMinimalConsumerProfile(opts: {
  accountId: string;
  name: string;
  gender?: "male" | "female";
  /** True only when gender comes from a reliable user/OAuth source (not name heuristic). */
  genderKnown?: boolean;
}): Promise<UserRow> {
  const existingId = await query<{ profile_user_id: string | null }>(
    `SELECT profile_user_id FROM user_accounts WHERE id = $1`,
    [opts.accountId]
  );
  const linked = existingId.rows[0]?.profile_user_id;
  if (linked) {
    const row = await getUserById(linked);
    if (row) return row;
  }

  const consent = await loadAccountConsentForStub(opts.accountId);
  if (!consent) {
    throw new Error("ACCOUNT_MISSING");
  }

  const genderKnown = Boolean(opts.genderKnown && opts.gender);
  // Schema CHECK (male|female) — filler only when unknown; never personalize as fact.
  const gender: "male" | "female" = genderKnown ? opts.gender! : "female";

  const baseMeta: Record<string, unknown> = {
    stubProfile: true,
    ...(genderKnown ? {} : { genderUnspecified: true }),
  };

  return createUserProfileForAccount(opts.accountId, {
    name: opts.name,
    gender,
    birthDate: null,
    zodiac: "",
    lifeFocus: "general",
    astroMeta: mergeConsentIntoAstroMeta(baseMeta, consent),
  });
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

  const birthDate =
    typeof data.birthDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(data.birthDate.trim())
      ? data.birthDate.trim().slice(0, 10)
      : data.birthDate === null
        ? null
        : current.birth_date;
  const astroMeta =
    data.astroMeta ??
    (birthDate ? buildAstroMeta(birthDate) : null) ??
    current.astro_meta;

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
      storedProfileName(data.name),
      data.gender,
      birthDate,
      data.zodiac ?? current.zodiac,
      data.birthTime ?? null,
      data.birthCity ?? null,
      data.lifeFocus ?? "general",
      data.mainQuestion ?? null,
      JSON.stringify(astroMeta),
    ]
  );
  return rows[0] ?? null;
}

export async function linkSessionToUser(
  sessionId: string,
  profileUserId: string,
  claimToken?: string | null,
  client?: import("./db").PoolClient
): Promise<boolean> {
  const { verifySessionClaimForId } = await import("@/lib/session-claim");
  const run = <T extends Record<string, unknown>>(text: string, params?: unknown[]) =>
    client ? queryClient<T>(client, text, params) : query<T>(text, params);

  const { rows: sessionRows } = await run<{ id: string; user_id: string | null }>(
    `SELECT id, user_id FROM sessions WHERE id = $1 LIMIT 1`,
    [sessionId]
  );
  const session = sessionRows[0];
  if (!session) return false;
  if (session.user_id === profileUserId) return true;
  if (session.user_id != null) return false;

  // Orphan guest session — require signed claim cookie (anti-hijack).
  const claimed = await verifySessionClaimForId(sessionId, claimToken);
  if (!claimed) return false;

  const { rows } = await run<{ id: string }>(
    `UPDATE sessions AS s
     SET user_id = u.id, updated_at = NOW()
     FROM users u
     WHERE s.id = $1
       AND u.id = $2
       AND (s.user_id IS NULL OR s.user_id = u.id)
     RETURNING s.id`,
    [sessionId, profileUserId]
  );
  return Boolean(rows[0]);
}

/** Attach session to profile only when both rows exist in DB. */
export async function attachSessionToProfile(
  sessionId: string | undefined,
  profileUserId: string | undefined,
  claimToken?: string | null
): Promise<boolean> {
  if (!sessionId || !profileUserId) return false;
  return linkSessionToUser(sessionId, profileUserId, claimToken);
}

export async function createHistoryEntry(
  data: {
    userId: string;
    characterName: string;
    contextData: Record<string, unknown>;
    isPaid?: boolean;
  },
  client?: import("./db").PoolClient
) {
  const run = client
    ? (text: string, params?: unknown[]) => queryClient<{ id: string }>(client, text, params)
    : (text: string, params?: unknown[]) => query<{ id: string }>(text, params);
  const { rows } = await run(
    `INSERT INTO history (user_id, character_name, context_data, is_paid)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [data.userId, data.characterName, JSON.stringify(data.contextData), data.isPaid ?? false]
  );
  return rows[0];
}

export async function getLatestHistoryEntry(
  userId: string,
  opts?: { characterName?: string; contextType?: string },
  client?: import("./db").PoolClient
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

  const run = client
    ? (text: string, p?: unknown[]) =>
        queryClient<{ id: string; context_data: Record<string, unknown>; created_at: Date }>(
          client,
          text,
          p
        )
    : (text: string, p?: unknown[]) =>
        query<{ id: string; context_data: Record<string, unknown>; created_at: Date }>(text, p);

  const { rows } = await run(sql, params);
  return rows[0] ?? null;
}

/** Latest explicit daily_triplet history only — never ordinary type=triplet. */
export async function getLatestDailyTripletHistory(
  userId: string,
  client?: import("./db").PoolClient
): Promise<{ id: string; context_data: Record<string, unknown>; created_at: Date } | null> {
  return getLatestHistoryEntry(
    userId,
    { characterName: "triplet", contextType: "daily_triplet" },
    client
  );
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

  if ((result.rowCount ?? 0) > 0 && entry?.character_name) {
    await deleteUserChatForCharacter(userId, entry.character_name);
  }

  if ((result.rowCount ?? 0) > 0 && entry?.created_at) {
    const ctx = entry.context_data as Record<string, unknown> | undefined;
    // Deleting ordinary triplet must not mint a daily cooldown.
    // Deleting daily history must keep entitlement consumed for the rolling window.
    if (ctx?.type === "daily_triplet") {
      await recordTripletDrawAnchor(userId, entry.created_at);
    }
  }

  return (result.rowCount ?? 0) > 0;
}

/**
 * Server daily entitlement anchor (rolling 24h).
 * Writes lastDailyTripletDrawAt; mirrors lastTripletDrawAt for legacy client readers.
 * Ordinary triplets must never call this.
 */
export async function recordTripletDrawAnchor(
  userId: string,
  at: Date | string = new Date(),
  client?: import("./db").PoolClient
): Promise<void> {
  const iso = at instanceof Date ? at.toISOString() : at;
  const run = client
    ? (text: string, params?: unknown[]) => queryClient(client, text, params)
    : (text: string, params?: unknown[]) => query(text, params);
  await run(
    `UPDATE users
     SET astro_meta = COALESCE(astro_meta, '{}'::jsonb)
       || jsonb_build_object(
            'lastDailyTripletDrawAt', $2::text,
            'lastTripletDrawAt', $2::text
          )
     WHERE id = $1`,
    [userId, iso]
  );
}

/** Admin / support: reset daily cards + daily energy only — never guestIntroUsedAt / ordinary triplets. */
export async function resetTripletCooldown(userId: string): Promise<{
  ok: boolean;
  deletedHistory: number;
  deletedDailyHistory: number;
  deletedDailyReadings: number;
  hadTripletAnchor: boolean;
  hadDailyAnchor: boolean;
}> {
  const empty = {
    ok: false,
    deletedHistory: 0,
    deletedDailyHistory: 0,
    deletedDailyReadings: 0,
    hadTripletAnchor: false,
    hadDailyAnchor: false,
  };

  const { rows } = await query<{ astro_meta: Record<string, unknown> | null }>(
    `SELECT astro_meta FROM users WHERE id = $1`,
    [userId]
  );
  if (!rows[0]) {
    return empty;
  }

  const meta = rows[0].astro_meta ?? {};
  const hadTripletAnchor =
    (typeof meta.lastDailyTripletDrawAt === "string" &&
      Boolean(String(meta.lastDailyTripletDrawAt).trim())) ||
    (typeof meta.lastTripletDrawAt === "string" &&
      Boolean(String(meta.lastTripletDrawAt).trim()));

  await query(
    `UPDATE users
     SET astro_meta = COALESCE(astro_meta, '{}'::jsonb)
       - 'lastTripletDrawAt'
       - 'lastDailyTripletDrawAt'
     WHERE id = $1`,
    [userId]
  );

  const [dailyTripletDel, dailyHistoryDel, dailyReadingsDel, hadDailyAnchor] = await Promise.all([
    query(
      `DELETE FROM history
       WHERE user_id = $1
         AND context_data->>'type' = 'daily_triplet'`,
      [userId]
    ),
    query(
      `DELETE FROM history
       WHERE user_id = $1
         AND (
           character_name = 'daily_energy'
           OR context_data->>'type' = 'daily_reading'
         )`,
      [userId]
    ),
    query(`DELETE FROM daily_readings WHERE user_id = $1`, [userId]),
    clearDailyReadingAnchors(userId),
  ]);

  return {
    ok: true,
    deletedHistory: dailyTripletDel.rowCount ?? 0,
    deletedDailyHistory: dailyHistoryDel.rowCount ?? 0,
    deletedDailyReadings: dailyReadingsDel.rowCount ?? 0,
    hadTripletAnchor,
    hadDailyAnchor,
  };
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
  if (trimmed.startsWith("/api/scene-art/") || trimmed.startsWith("/scene-art/")) {
    return true;
  }
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === "zovus.ru" ||
      host === "www.zovus.ru" ||
      host.endsWith(".zovus.ru")
    );
  } catch {
    return false;
  }
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
