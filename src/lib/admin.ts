import { query } from "./db";
import { getSupportAdminStats } from "./support-service";

export async function logAdminAction(
  adminId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  await query(
    `INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, action, entityType ?? null, entityId ?? null, JSON.stringify(details ?? {})]
  );
}

export async function getDashboardStats() {
  const [{ rows }, support] = await Promise.all([
    query<{
    users: string;
    experts: string;
    profiles: string;
    sessions: string;
    messages: string;
    payments_ok: string;
    revenue: string;
    rune_purchases: string;
    rune_revenue: string;
    influencers: string;
    bloggers: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM user_accounts)::text AS users,
      (SELECT COUNT(*) FROM expert_accounts)::text AS experts,
      (SELECT COUNT(*) FROM users)::text AS profiles,
      (SELECT COUNT(*) FROM sessions)::text AS sessions,
      (SELECT COUNT(*) FROM chat_messages)::text AS messages,
      (SELECT COUNT(*) FROM payments WHERE status = 'succeeded')::text AS payments_ok,
      (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'succeeded')::text AS revenue,
      (SELECT COUNT(*) FROM rune_transactions WHERE type = 'purchase' AND payment_id IS NOT NULL)::text AS rune_purchases,
      (SELECT COALESCE(SUM(
        CASE
          WHEN rt.description ~ 'Пополнение на [0-9]+ ₽'
            THEN (regexp_match(rt.description, 'Пополнение на ([0-9]+) ₽'))[1]::numeric
          ELSE COALESCE(rp.price_rub, 0)
        END
      ), 0)
       FROM rune_transactions rt
       LEFT JOIN rune_packages rp
         ON rt.type = 'purchase'
        AND rt.description LIKE 'Пакет рун «' || rp.name || '»:%'
       WHERE rt.type = 'purchase' AND rt.payment_id IS NOT NULL)::text AS rune_revenue,
      (SELECT COUNT(*) FROM influencers)::text AS influencers,
      (SELECT COUNT(*) FROM bloggers)::text AS bloggers
  `),
    getSupportAdminStats(),
  ]);
  const s = rows[0];
  const legacyRevenue = parseFloat(s?.revenue ?? "0");
  const runeRevenue = parseFloat(s?.rune_revenue ?? "0");
  return {
    users: parseInt(s?.users ?? "0", 10),
    experts: parseInt(s?.experts ?? "0", 10),
    profiles: parseInt(s?.profiles ?? "0", 10),
    sessions: parseInt(s?.sessions ?? "0", 10),
    messages: parseInt(s?.messages ?? "0", 10),
    paymentsOk: parseInt(s?.payments_ok ?? "0", 10) + parseInt(s?.rune_purchases ?? "0", 10),
    runePurchases: parseInt(s?.rune_purchases ?? "0", 10),
    revenue: legacyRevenue + runeRevenue,
    legacyRevenue,
    runeRevenue,
    influencers: parseInt(s?.influencers ?? "0", 10),
    bloggers: parseInt(s?.bloggers ?? "0", 10),
    supportOpen: support.open,
    supportUnread: support.unread,
  };
}

export async function listUserAccounts(limit = 50, offset = 0) {
  const { rows } = await query<{
    id: string;
    email: string;
    name: string;
    created_at: Date;
    profile_name: string | null;
    profile_user_id: string | null;
    zodiac: string | null;
    sessions_count: string;
    is_unlimited: boolean;
    last_triplet_draw_at: string | null;
    rune_balance: number | null;
  }>(
    `SELECT ua.id, ua.email, ua.name, ua.created_at, ua.is_unlimited,
            ua.profile_user_id,
            u.name AS profile_name, u.zodiac,
            u.rune_balance,
            u.astro_meta->>'lastTripletDrawAt' AS last_triplet_draw_at,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id)::text AS sessions_count
     FROM user_accounts ua
     LEFT JOIN users u ON u.id = ua.profile_user_id
     ORDER BY ua.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function listOnboardingProfiles(limit = 50, offset = 0) {
  const { rows } = await query<{
    id: string;
    name: string;
    gender: string;
    birth_date: string;
    zodiac: string;
    created_at: Date;
    rune_balance: number;
    account_email: string | null;
  }>(
    `SELECT u.id, u.name, u.gender, u.birth_date::text, u.zodiac, u.created_at,
            u.rune_balance,
            (SELECT ua.email FROM user_accounts ua WHERE ua.profile_user_id = u.id LIMIT 1) AS account_email
     FROM users u
     ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function deleteUserAccount(id: string) {
  await query("DELETE FROM user_accounts WHERE id = $1", [id]);
}

export async function listExperts(limit = 50, offset = 0) {
  const { rows } = await query<{
    id: string;
    email: string;
    name: string;
    slug: string;
    title: string | null;
    split_percent: number;
    is_active: boolean;
    created_at: Date;
    knowledge_count: string;
  }>(
    `SELECT ea.id, ea.email, ea.name, ea.slug, ea.title, ea.split_percent, ea.is_active, ea.created_at,
            (SELECT COUNT(*) FROM blogger_knowledge bk
             JOIN bloggers b ON b.id = bk.blogger_id WHERE b.slug = ea.slug)::text AS knowledge_count
     FROM expert_accounts ea ORDER BY ea.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function updateExpert(
  id: string,
  data: Partial<{ is_active: boolean; split_percent: number; title: string; style_notes: string }>
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
  }
  if (!fields.length) return;
  values.push(id);
  await query(`UPDATE expert_accounts SET ${fields.join(", ")} WHERE id = $${i}`, values);
  const expert = await query<{ slug: string }>("SELECT slug FROM expert_accounts WHERE id = $1", [id]);
  const slug = expert.rows[0]?.slug;
  if (slug && data.is_active !== undefined) {
    await query("UPDATE bloggers SET is_active = $2 WHERE slug = $1", [slug, data.is_active]);
  }
  if (slug && data.split_percent !== undefined) {
    await query("UPDATE bloggers SET split_percent = $2 WHERE slug = $1", [slug, data.split_percent]);
  }
}

export async function listInfluencers(limit = 50, offset = 0) {
  const { rows } = await query<{
    id: string;
    name: string;
    token: string;
    telegram_link: string | null;
    balance: string;
    created_at: Date;
    clicks: string;
  }>(
    `SELECT i.id, i.name, i.token, i.telegram_link, i.balance::text, i.created_at,
            (SELECT COUNT(*) FROM influencer_clicks ic WHERE ic.influencer_id = i.id)::text AS clicks
     FROM influencers i ORDER BY i.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function updateInfluencerBalance(id: string, balance: number) {
  await query("UPDATE influencers SET balance = $2 WHERE id = $1", [id, balance]);
}

export async function listBloggers(limit = 50, offset = 0) {
  const { rows } = await query<{
    id: string;
    slug: string;
    display_name: string;
    title: string | null;
    split_percent: number;
    is_active: boolean;
    emoji: string | null;
  }>(
    `SELECT id, slug, display_name, title, split_percent, is_active, emoji
     FROM bloggers ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function updateBlogger(
  id: string,
  data: Partial<{ is_active: boolean; split_percent: number; display_name: string; title: string; style_notes: string }>
) {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
  }
  if (!fields.length) return;
  values.push(id);
  await query(`UPDATE bloggers SET ${fields.join(", ")} WHERE id = $${i}`, values);
}

export async function listPayments(limit = 50, offset = 0) {
  const { rows } = await query<{
    id: string;
    order_id: string | null;
    amount: string;
    runes: string | null;
    payment_type: string;
    status: string;
    referrer_slug: string | null;
    user_email: string | null;
    source: string;
    created_at: Date;
  }>(
    `SELECT * FROM (
       SELECT
         p.id::text AS id,
         p.order_id,
         p.amount::text AS amount,
         NULL::text AS runes,
         p.payment_type,
         p.status,
         p.referrer_slug,
         NULL::text AS user_email,
         'legacy'::text AS source,
         p.created_at
       FROM payments p

       UNION ALL

       SELECT
         rt.payment_id AS id,
         rt.payment_id AS order_id,
         COALESCE(
           (regexp_match(rt.description, 'Пополнение на ([0-9]+) ₽'))[1],
           rp.price_rub::text,
           '0'
         ) AS amount,
         rt.amount::text AS runes,
         'rune_purchase'::text AS payment_type,
         'succeeded'::text AS status,
         NULL::text AS referrer_slug,
         ua.email AS user_email,
         'runes'::text AS source,
         rt.created_at
       FROM rune_transactions rt
       LEFT JOIN rune_packages rp
         ON rt.description LIKE 'Пакет рун «' || rp.name || '»:%'
       LEFT JOIN users u ON u.id = rt.user_id
       LEFT JOIN user_accounts ua ON ua.profile_user_id = u.id
       WHERE rt.type = 'purchase' AND rt.payment_id IS NOT NULL
     ) combined
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function listSessions(limit = 50, offset = 0) {
  const { rows } = await query<{
    id: string;
    referrer_slug: string | null;
    free_questions_used: number;
    has_single_unlock: boolean;
    paid_until: Date | null;
    created_at: Date;
    messages_count: string;
  }>(
    `SELECT s.id, s.referrer_slug, s.free_questions_used, s.has_single_unlock, s.paid_until, s.created_at,
            (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = s.id)::text AS messages_count
     FROM sessions s ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function listChatMessages(limit = 100, offset = 0, search?: string) {
  if (search) {
    const { rows } = await query<{
      id: string;
      session_id: string;
      character_id: string;
      role: string;
      content: string;
      created_at: Date;
    }>(
      `SELECT id, session_id, character_id, role, content, created_at
       FROM chat_messages WHERE content ILIKE $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [`%${search}%`, limit, offset]
    );
    return rows;
  }
  const { rows } = await query<{
    id: string;
    session_id: string;
    character_id: string;
    role: string;
    content: string;
    created_at: Date;
  }>(
    `SELECT id, session_id, character_id, role, content, created_at
     FROM chat_messages ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function deleteChatMessage(id: string) {
  await query("DELETE FROM chat_messages WHERE id = $1", [id]);
}

export async function listAuditLog(limit = 50, offset = 0) {
  const { rows } = await query<{
    id: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    details: Record<string, unknown>;
    created_at: Date;
    admin_email: string | null;
  }>(
    `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details, al.created_at,
            aa.email AS admin_email
     FROM admin_audit_log al
     LEFT JOIN admin_accounts aa ON aa.id = al.admin_id
     ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function listKnowledge(limit = 50, offset = 0) {
  const { rows } = await query<{
    id: string;
    title: string | null;
    content: string;
    created_at: Date;
    blogger_slug: string;
    display_name: string;
  }>(
    `SELECT bk.id, bk.title, bk.content, bk.created_at, b.slug AS blogger_slug, b.display_name
     FROM blogger_knowledge bk
     JOIN bloggers b ON b.id = bk.blogger_id
     ORDER BY bk.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function deleteKnowledge(id: string) {
  await query("DELETE FROM blogger_knowledge WHERE id = $1", [id]);
}

export async function getRecentPaymentsChart() {
  const { rows } = await query<{ day: string; count: string; total: string }>(
    `SELECT day, SUM(cnt)::text AS count, SUM(total)::text AS total
     FROM (
       SELECT DATE(created_at)::text AS day, COUNT(*)::numeric AS cnt, COALESCE(SUM(amount), 0)::numeric AS total
       FROM payments WHERE status = 'succeeded' AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)

       UNION ALL

       SELECT
         DATE(rt.created_at)::text AS day,
         COUNT(*)::numeric AS cnt,
         COALESCE(SUM(
           CASE
             WHEN rt.description ~ 'Пополнение на [0-9]+ ₽'
               THEN (regexp_match(rt.description, 'Пополнение на ([0-9]+) ₽'))[1]::numeric
             ELSE COALESCE(rp.price_rub, 0)
           END
         ), 0)::numeric AS total
       FROM rune_transactions rt
       LEFT JOIN rune_packages rp
         ON rt.description LIKE 'Пакет рун «' || rp.name || '»:%'
       WHERE rt.type = 'purchase'
         AND rt.payment_id IS NOT NULL
         AND rt.created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(rt.created_at)
     ) daily
     GROUP BY day
     ORDER BY day DESC
     LIMIT 30`
  );
  return rows;
}
