import { query, queryClient, withTransaction } from "./db";
import { deleteUserTripletForMaster } from "./triplet-cleanup";
import { getUserById } from "./users";
import { tarotCardsKey } from "./tarot";

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}

export interface ExpertAccount {
  id: string;
  email: string;
  name: string;
  slug: string;
  title: string | null;
  style_notes: string | null;
  emoji: string | null;
  split_percent: number;
  password_hash: string;
}

export async function findUserByEmail(email: string) {
  const { rows } = await query<UserAccount>(
    "SELECT id, email, name, password_hash FROM user_accounts WHERE email = $1",
    [email.toLowerCase()]
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string) {
  const { rows } = await query<{
    id: string;
    email: string;
    name: string;
    profile_user_id: string | null;
    is_unlimited: boolean;
  }>(
    "SELECT id, email, name, profile_user_id, is_unlimited FROM user_accounts WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

export async function isAccountUnlimited(accountId: string): Promise<boolean> {
  const account = await findUserById(accountId);
  return account?.is_unlimited ?? false;
}

export async function isProfileUnlimited(profileUserId: string): Promise<boolean> {
  const { rows } = await query<{ is_unlimited: boolean }>(
    "SELECT is_unlimited FROM user_accounts WHERE profile_user_id = $1 LIMIT 1",
    [profileUserId]
  );
  return rows[0]?.is_unlimited ?? false;
}

export async function resolveUnlimitedAccess(opts: {
  accountId?: string | null;
  profileUserId?: string | null;
}): Promise<boolean> {
  if (opts.accountId && (await isAccountUnlimited(opts.accountId))) return true;
  if (opts.profileUserId && (await isProfileUnlimited(opts.profileUserId))) return true;
  return false;
}

export async function setUserAccountUnlimited(accountId: string, unlimited: boolean) {
  await query("UPDATE user_accounts SET is_unlimited = $2 WHERE id = $1", [
    accountId,
    unlimited,
  ]);
}

/** Returns profile id only when this account exclusively owns the linked profile (UUID link only). */
export async function getProfileUserIdForAccount(accountId: string): Promise<string | null> {
  return withTransaction(async (client) => {
    const accountResult = await queryClient<{
      id: string;
      profile_user_id: string | null;
    }>(client, "SELECT id, profile_user_id FROM user_accounts WHERE id = $1 FOR UPDATE", [
      accountId,
    ]);
    const account = accountResult.rows[0];
    if (!account) return null;

    const profileId = account.profile_user_id ?? null;
    if (!profileId) {
      return null;
    }

    const profileRows = await queryClient<{ id: string }>(
      client,
      "SELECT id FROM users WHERE id = $1",
      [profileId]
    );
    if (!profileRows.rows[0]) {
      await queryClient(client, "UPDATE user_accounts SET profile_user_id = NULL WHERE id = $1", [
        accountId,
      ]);
      return null;
    }

    const linkedAccounts = await queryClient<{ id: string; created_at: Date }>(
      client,
      `SELECT id, created_at FROM user_accounts
       WHERE profile_user_id = $1
       ORDER BY created_at ASC
       FOR UPDATE`,
      [profileId]
    );

    if (linkedAccounts.rows.length === 0) {
      await queryClient(client, "UPDATE user_accounts SET profile_user_id = NULL WHERE id = $1", [
        accountId,
      ]);
      return null;
    }

    if (linkedAccounts.rows.length === 1) {
      return linkedAccounts.rows[0].id === accountId ? profileId : null;
    }

    const staleAccountIds = linkedAccounts.rows
      .filter((row) => row.id !== accountId)
      .map((row) => row.id);
    if (staleAccountIds.length > 0) {
      await queryClient(
        client,
        "UPDATE user_accounts SET profile_user_id = NULL WHERE id = ANY($1::uuid[])",
        [staleAccountIds]
      );
    }

    return linkedAccounts.rows.some((row) => row.id === accountId) ? profileId : null;
  });
}

export async function updateUserAccountName(accountId: string, name: string) {
  await query("UPDATE user_accounts SET name = $2 WHERE id = $1", [accountId, name.trim()]);
}

export async function linkAccountToProfile(
  accountId: string,
  profileUserId: string
): Promise<boolean> {
  return withTransaction(async (client) => {
    const profileResult = await queryClient<{ id: string }>(
      client,
      "SELECT id FROM users WHERE id = $1 FOR UPDATE",
      [profileUserId]
    );
    if (!profileResult.rows[0]) return false;

    const accountResult = await queryClient<{
      id: string;
      profile_user_id: string | null;
    }>(client, "SELECT id, profile_user_id FROM user_accounts WHERE id = $1 FOR UPDATE", [
      accountId,
    ]);
    const account = accountResult.rows[0];
    if (!account) return false;

    if (account.profile_user_id === profileUserId) return true;

    const conflict = await queryClient<{ id: string }>(
      client,
      `SELECT id FROM user_accounts
       WHERE profile_user_id = $1 AND id <> $2
       LIMIT 1
       FOR UPDATE`,
      [profileUserId, accountId]
    );
    if (conflict.rows[0]) return false;

    const linkResult = await queryClient(
      client,
      "UPDATE user_accounts SET profile_user_id = $2 WHERE id = $1",
      [accountId, profileUserId]
    );
    return (linkResult.rowCount ?? 0) > 0;
  });
}

export async function createUser(email: string, passwordHash: string, name: string) {
  const { rows } = await query<{ id: string; email: string; name: string }>(
    "INSERT INTO user_accounts (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name",
    [email.toLowerCase(), passwordHash, name]
  );
  return rows[0];
}

export async function findExpertByEmail(email: string) {
  const { rows } = await query<ExpertAccount>(
    `SELECT id, email, name, slug, title, style_notes, emoji, split_percent, password_hash
     FROM expert_accounts WHERE email = $1`,
    [email.toLowerCase()]
  );
  return rows[0] ?? null;
}

export async function findExpertById(id: string) {
  const { rows } = await query<Omit<ExpertAccount, "password_hash">>(
    `SELECT id, email, name, slug, title, style_notes, emoji, split_percent
     FROM expert_accounts WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createExpert(data: {
  email: string;
  passwordHash: string;
  name: string;
  slug: string;
  title?: string;
}) {
  const { rows } = await query<{ id: string; email: string; name: string; slug: string }>(
    `INSERT INTO expert_accounts (email, password_hash, name, slug, title)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, slug`,
    [data.email.toLowerCase(), data.passwordHash, data.name, data.slug, data.title ?? null]
  );

  const expert = rows[0];

  await query(
    `INSERT INTO bloggers (slug, display_name, title, split_percent, style_notes, emoji)
     VALUES ($1, $2, $3, 80, $4, '🔮')
     ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name, title = EXCLUDED.title`,
    [data.slug, data.name, data.title ?? "Эзотерик · Zovus", ""]
  );

  return expert;
}

/** Remove all chat messages for one master profile thread. */
export async function clearProfileChatThread(
  profileUserId: string,
  characterId: string
): Promise<number> {
  const result = await query(
    `DELETE FROM chat_messages cm
     WHERE cm.character_id = $2
       AND (
         cm.owner_user_id = $1
         OR cm.session_id IN (SELECT id FROM sessions WHERE user_id = $1)
       )`,
    [profileUserId, characterId]
  );
  return result.rowCount ?? 0;
}

/** Clear chat messages and saved readings so history API does not restore them. */
export async function clearMasterChatData(
  profileUserId: string,
  characterId: string
): Promise<{ messagesDeleted: number; historyDeleted: number }> {
  const messagesDeleted = await clearProfileChatThread(profileUserId, characterId);

  const historyResult = await query(
    `DELETE FROM history
     WHERE user_id = $1
       AND character_name = $2
       AND context_data->>'type' IN ('reading', 'intention_spread')`,
    [profileUserId, characterId]
  );

  await query(
    `UPDATE sessions
     SET intention = NULL,
         spread_type = NULL,
         cards = NULL,
         awaiting_context = FALSE,
         updated_at = NOW()
     WHERE user_id = $1 AND character_key = $2`,
    [profileUserId, characterId]
  );

  await deleteUserTripletForMaster(profileUserId, characterId);

  return {
    messagesDeleted,
    historyDeleted: historyResult.rowCount ?? 0,
  };
}

export async function getUserReadingHistory(profileUserId: string) {
  const { rows } = await query<{
    id: string;
    character_name: string;
    context_data: Record<string, unknown>;
    is_paid: boolean;
    created_at: Date;
  }>(
    `SELECT id, character_name, context_data, is_paid, created_at
     FROM history
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [profileUserId]
  );
  return rows;
}

export function findCachedIntentionSpread(
  history: Awaited<ReturnType<typeof getUserReadingHistory>>,
  characterId: string,
  intention: string,
  cards: { name: string }[]
): {
  reading: string;
  tarotCards: { name: string; meaning?: string }[];
  deckSystem?: string;
  system?: string;
} | null {
  const key = tarotCardsKey(cards);
  if (!key) return null;

  const entry = history.find((r) => {
    if (r.character_name !== characterId) return false;
    const ctx = r.context_data;
    if (ctx?.type !== "intention_spread" || ctx.intention !== intention) return false;
    const reading = typeof ctx.reading === "string" ? ctx.reading.trim() : "";
    if (reading.length < 80) return false;
    const stored = ctx.tarotCards as { name: string }[] | undefined;
    return tarotCardsKey(stored) === key;
  });

  if (!entry) return null;
  const ctx = entry.context_data;
  return {
    reading: ctx.reading as string,
    tarotCards: (ctx.tarotCards as { name: string; meaning?: string }[]) ?? cards,
    deckSystem: ctx.deckSystem as string | undefined,
    system: ctx.system as string | undefined,
  };
}

export async function getUserPayments(profileUserId: string) {
  const { rows } = await query<{
    amount: string;
    payment_type: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT amount, payment_type, status, created_at FROM payments
     WHERE user_id = $1 OR session_id IN (SELECT id FROM sessions WHERE user_id = $1)
     ORDER BY created_at DESC LIMIT 20`,
    [profileUserId]
  );
  return rows;
}

export async function getUserSubscription(profileUserId: string) {
  const { rows } = await query<{
    paid_until: Date | null;
    has_single_unlock: boolean;
    is_unlimited: boolean;
  }>(
    `SELECT s.paid_until, s.has_single_unlock,
            COALESCE(ua.is_unlimited, FALSE) AS is_unlimited
     FROM sessions s
     LEFT JOIN user_accounts ua ON ua.profile_user_id = s.user_id
     WHERE s.user_id = $1
     ORDER BY s.updated_at DESC LIMIT 1`,
    [profileUserId]
  );
  return rows[0] ?? null;
}

export async function getExpertStats(slug: string) {
  const { rows } = await query<{ payments: string; revenue: string }>(
    `SELECT COUNT(*)::text AS payments,
            COALESCE(SUM(amount * COALESCE(blogger_split_percent, 80) / 100), 0)::text AS revenue
     FROM payments WHERE referrer_slug = $1 AND status = 'succeeded'`,
    [slug]
  );
  const { rows: sessions } = await query<{ visits: string }>(
    "SELECT COUNT(*)::text AS visits FROM sessions WHERE referrer_slug = $1",
    [slug]
  );
  return {
    visits: parseInt(sessions[0]?.visits ?? "0", 10),
    payments: parseInt(rows[0]?.payments ?? "0", 10),
    revenue: parseFloat(rows[0]?.revenue ?? "0"),
  };
}

export async function linkSessionToUser(sessionId: string, userId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `UPDATE sessions AS s
     SET user_id = $2, updated_at = NOW()
     WHERE s.id = $1
       AND EXISTS (SELECT 1 FROM users u WHERE u.id = $2)
       AND (s.user_id IS NULL OR s.user_id = $2)
     RETURNING s.id`,
    [sessionId, userId]
  );
  return Boolean(rows[0]);
}

export async function deleteUserChatForCharacter(
  profileUserId: string,
  characterId: string
): Promise<number> {
  if (!characterId || characterId === "triplet") return 0;

  const result = await query(
    `DELETE FROM chat_messages cm
     USING sessions s
     WHERE cm.session_id = s.id
       AND s.user_id = $1
       AND cm.character_id = $2`,
    [profileUserId, characterId]
  );
  return result.rowCount ?? 0;
}
