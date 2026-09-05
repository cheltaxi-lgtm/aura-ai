import { query, queryClient, withTransaction } from "./db";
import { deleteUserTripletForMaster } from "./triplet-cleanup";
import { normalizeStoredDisplayName } from "./normalize-person-name";
import { getUserById } from "./users";
import { tarotCardsKey } from "./tarot";

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
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

/** Best-effort last visit stamp. Must not fail login if the column/update is unavailable. */
export async function touchAccountLastLogin(accountId: string): Promise<void> {
  try {
    await query("UPDATE user_accounts SET last_login_at = NOW() WHERE id = $1", [accountId]);
  } catch (err) {
    console.warn("[auth] touchAccountLastLogin failed", accountId, err);
  }
}

/** Returns profile id only when this account exclusively owns the linked profile (UUID link only). */
/**
 * Resolve onboarding profile id for an account.
 * Read-only: must not lock rows or unlink sibling accounts on hot paths
 * (job polling, /api/auth/me, natal GET) — that caused intermittent 401s
 * right after a paid natal job was successfully enqueued.
 */
export async function getProfileUserIdForAccount(accountId: string): Promise<string | null> {
  const { rows } = await query<{ profile_user_id: string | null }>(
    `SELECT ua.profile_user_id
     FROM user_accounts ua
     WHERE ua.id = $1
       AND ua.erasure_requested_at IS NULL
       AND ua.profile_user_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM users u WHERE u.id = ua.profile_user_id AND u.erasure_requested_at IS NULL)`,
    [accountId]
  );
  return rows[0]?.profile_user_id ?? null;
}

export async function updateUserAccountName(accountId: string, name: string) {
  const normalized = normalizeStoredDisplayName(name, name.trim() || "Гость");
  await query("UPDATE user_accounts SET name = $2 WHERE id = $1", [accountId, normalized]);
}

export interface AccountConsentSnapshot {
  termsAcceptedAt: string | null;
  ageConfirmedAt: string | null;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
}

/** Server-authoritative registration instant (`user_accounts.created_at`). */
export async function getAccountCreatedAt(accountId: string): Promise<Date | null> {
  const { rows } = await query<{ created_at: Date }>(
    `SELECT created_at FROM user_accounts WHERE id = $1`,
    [accountId]
  );
  return rows[0]?.created_at ?? null;
}

/** Daily-cards reminder. Default ON; unsubscribe turns it off. */
export async function getAccountDailyCardsReminder(accountId: string): Promise<boolean> {
  const { rows } = await query<{ daily_cards_reminder: boolean }>(
    `SELECT daily_cards_reminder FROM user_accounts WHERE id = $1`,
    [accountId]
  );
  return Boolean(rows[0]?.daily_cards_reminder);
}

export async function setAccountDailyCardsReminder(
  accountId: string,
  enabled: boolean
): Promise<boolean> {
  const { rows } = await query<{ daily_cards_reminder: boolean }>(
    `UPDATE user_accounts SET daily_cards_reminder = $2
     WHERE id = $1
     RETURNING daily_cards_reminder`,
    [accountId, enabled]
  );
  return Boolean(rows[0]?.daily_cards_reminder);
}

/** Explicit marketing / win-back gate. Unsubscribe may turn this OFF. */
export async function setAccountMarketingConsent(
  accountId: string,
  enabled: boolean
): Promise<boolean> {
  const { rows } = await query<{ marketing_consent: boolean }>(
    `UPDATE user_accounts SET
       marketing_consent = $2,
       marketing_consent_at = CASE
         WHEN $2 THEN COALESCE(marketing_consent_at, NOW())
         ELSE marketing_consent_at
       END
     WHERE id = $1
     RETURNING marketing_consent`,
    [accountId, enabled]
  );
  return Boolean(rows[0]?.marketing_consent);
}

export async function getAccountConsentSnapshot(
  accountId: string
): Promise<AccountConsentSnapshot | null> {
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

export async function hasAccountAgeConfirmed(accountId: string): Promise<boolean> {
  const snap = await getAccountConsentSnapshot(accountId);
  if (snap?.ageConfirmedAt) return true;

  // Heal pre-migration accounts: profile may already carry explicit 18+ consent
  // while user_accounts.age_confirmed_at is still NULL.
  const profileUserId = await getProfileUserIdForAccount(accountId);
  if (!profileUserId) return false;
  const profile = await getUserById(profileUserId);
  const meta = profile?.astro_meta as { ageConfirmed?: boolean } | null | undefined;
  if (meta?.ageConfirmed !== true) return false;

  void recordAccountLegalConsent(accountId, { ageConfirmed: true }).catch(() => undefined);
  return true;
}

/** Persist explicit 18+ / terms consent on the account (and linked profile meta). */
export async function recordAccountLegalConsent(
  accountId: string,
  opts: {
    ageConfirmed?: boolean;
    acceptedTerms?: boolean;
    marketingConsent?: boolean;
  }
): Promise<AccountConsentSnapshot | null> {
  const now = new Date().toISOString();
  const ageAt = opts.ageConfirmed === true ? now : null;
  const termsAt = opts.acceptedTerms === true ? now : null;
  const marketingOn = opts.marketingConsent === true;

  await query(
    `UPDATE user_accounts SET
       age_confirmed_at = CASE
         WHEN $2::timestamptz IS NOT NULL THEN COALESCE(age_confirmed_at, $2::timestamptz)
         ELSE age_confirmed_at
       END,
       terms_accepted_at = CASE
         WHEN $3::timestamptz IS NOT NULL THEN COALESCE(terms_accepted_at, $3::timestamptz)
         ELSE terms_accepted_at
       END,
       marketing_consent = CASE WHEN $4 THEN TRUE ELSE marketing_consent END,
       marketing_consent_at = CASE
         WHEN $4 THEN COALESCE(marketing_consent_at, $5::timestamptz)
         ELSE marketing_consent_at
       END
     WHERE id = $1`,
    [accountId, ageAt, termsAt, marketingOn, marketingOn ? now : null]
  );

  if (opts.ageConfirmed === true) {
    const profileUserId = await getProfileUserIdForAccount(accountId);
    if (profileUserId) {
      await query(
        `UPDATE users
         SET astro_meta = COALESCE(astro_meta, '{}'::jsonb) || $2::jsonb
         WHERE id = $1`,
        [
          profileUserId,
          JSON.stringify({ ageConfirmed: true, ageConfirmedAt: now }),
        ]
      );
    }
  }

  return getAccountConsentSnapshot(accountId);
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

/** First-touch only — never overwrites an existing attribution snapshot. */
export async function saveRegistrationAttributionIfEmpty(
  accountId: string,
  attribution: Record<string, string>
): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE user_accounts
     SET registration_attribution = $2::jsonb
     WHERE id = $1
       AND registration_attribution IS NULL`,
    [accountId, JSON.stringify(attribution)]
  );
  return (rowCount ?? 0) > 0;
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
  cards: { name: string }[],
  spreadId?: string | null,
  options?: {
    /** Only reuse a reading that belongs to this consultation session. */
    sessionId?: string | null;
    /**
     * When true (default for custom polls), never return a cross-session hit.
     * Same cards + same question must not surface a previous consultation.
     */
    requireSessionId?: boolean;
  }
): {
  reading: string;
  tarotCards: { name: string; meaning?: string }[];
  deckSystem?: string;
  system?: string;
  source?: string;
  provenance?: unknown;
  sessionId?: string;
} | null {
  const key = tarotCardsKey(cards);
  if (!key) return null;

  const sessionId = options?.sessionId?.trim() || null;
  const requireSessionId = options?.requireSessionId === true || Boolean(sessionId);
  if (requireSessionId && !sessionId) return null;

  const entry = history.find((r) => {
    if (r.character_name !== characterId) return false;
    const ctx = r.context_data;
    if (ctx?.type !== "intention_spread" || ctx.intention !== intention) return false;
    if (spreadId && ctx.spreadId && ctx.spreadId !== spreadId) return false;
    if (sessionId) {
      const storedSessionId =
        typeof ctx.sessionId === "string" ? ctx.sessionId.trim() : "";
      if (storedSessionId !== sessionId) return false;
    }
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
    source: typeof ctx.source === "string" ? ctx.source : undefined,
    provenance: ctx.provenance,
    sessionId: typeof ctx.sessionId === "string" ? ctx.sessionId : undefined,
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
