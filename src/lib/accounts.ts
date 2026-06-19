import { query } from "./db";

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

export async function getProfileUserIdForAccount(accountId: string): Promise<string | null> {
  const account = await findUserById(accountId);
  return account?.profile_user_id ?? null;
}

export async function updateUserAccountName(accountId: string, name: string) {
  await query("UPDATE user_accounts SET name = $2 WHERE id = $1", [accountId, name.trim()]);
}

export async function linkAccountToProfile(accountId: string, profileUserId: string) {
  await query("UPDATE user_accounts SET profile_user_id = $2 WHERE id = $1", [
    accountId,
    profileUserId,
  ]);
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
    [data.slug, data.name, data.title ?? "Эзотерик · Aura", ""]
  );

  return expert;
}

export async function getUserChatHistory(profileUserId: string) {
  const { rows } = await query<{
    character_id: string;
    role: string;
    content: string;
    created_at: Date;
  }>(
    `SELECT cm.character_id, cm.role, cm.content, cm.created_at
     FROM chat_messages cm
     JOIN sessions s ON s.id = cm.session_id
     WHERE s.user_id = $1
     ORDER BY cm.created_at DESC
     LIMIT 100`,
    [profileUserId]
  );
  return rows;
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
     RETURNING s.id`,
    [sessionId, userId]
  );
  return Boolean(rows[0]);
}
