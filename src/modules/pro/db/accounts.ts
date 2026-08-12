import { proQuery } from "../db";
import { isProAllowlistedUser } from "../config";
import { proFreeTrialDays, proFreeTrialRunes } from "../pricing";

export type ProAccountRow = {
  id: string;
  user_id: string;
  status: "pending" | "active" | "suspended" | "closed";
  tier: "free_trial" | "pro";
  display_name: string | null;
  brand_slug: string | null;
  specializations: string[];
  bio: string | null;
  timezone: string;
  onboarding_state: Record<string, unknown>;
  limits: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || `pro-${Date.now().toString(36)}`;
}

export async function getAccountByUserId(
  userId: string
): Promise<ProAccountRow | null> {
  const { rows } = await proQuery<ProAccountRow>(
    `SELECT * FROM pro.accounts WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function getAccountById(id: number | string): Promise<ProAccountRow | null> {
  const { rows } = await proQuery<ProAccountRow>(
    `SELECT * FROM pro.accounts WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function applyForProAccount(input: {
  userId: string;
  displayName?: string | null;
  specializations?: string[];
  bio?: string | null;
}): Promise<{ account: ProAccountRow; created: boolean }> {
  const existing = await getAccountByUserId(input.userId);
  if (existing) return { account: existing, created: false };

  const allowlisted = isProAllowlistedUser(input.userId);
  const status = allowlisted ? "active" : "pending";
  const display = (input.displayName || "Практик").trim().slice(0, 80);
  const specs = (input.specializations || [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  const bio =
    typeof input.bio === "string" ? input.bio.trim().slice(0, 2000) || null : null;
  let slug = slugify(display);
  const trialEnds = new Date();
  trialEnds.setUTCDate(trialEnds.getUTCDate() + proFreeTrialDays());
  const limits = {
    trial_ends_at: trialEnds.toISOString(),
    trial_runes: proFreeTrialRunes(),
    max_clients: Number(process.env.PRO_MAX_CLIENTS || 200),
    max_cases_per_day: Number(process.env.PRO_MAX_CASES_PER_DAY || 50),
  };

  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    try {
      const { rows } = await proQuery<ProAccountRow>(
        `INSERT INTO pro.accounts
           (user_id, status, tier, display_name, brand_slug, specializations, bio, limits, onboarding_state)
         VALUES ($1, $2, 'free_trial', $3, $4, $5, $6, $7::jsonb, '{}'::jsonb)
         RETURNING *`,
        [
          input.userId,
          status,
          display,
          candidate,
          specs,
          bio,
          JSON.stringify(limits),
        ]
      );
      const account = rows[0]!;
      await proQuery(
        `INSERT INTO pro.brand (account_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [account.id]
      );
      await proQuery(
        `INSERT INTO pro.style_profiles (account_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [account.id]
      );
      await writeAudit({
        accountId: account.id,
        actor: "user",
        actorUserId: input.userId,
        action: "account.apply",
        target: String(account.id),
        meta: { status, allowlisted },
      });
      return { account, created: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/unique|duplicate/i.test(msg)) throw e;
      slug = `${slugify(display)}-${randomSuffix()}`;
    }
  }
  throw new Error("pro_brand_slug_collision");
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

export async function updateOnboarding(
  accountId: string | number,
  patch: {
    displayName?: string;
    specializations?: string[];
    bio?: string;
    timezone?: string;
    addressForm?: "ty" | "vy" | "neutral";
    onboardingState?: Record<string, unknown>;
  }
): Promise<ProAccountRow | null> {
  const { rows } = await proQuery<ProAccountRow>(
    `UPDATE pro.accounts SET
       display_name = COALESCE($2, display_name),
       specializations = COALESCE($3, specializations),
       bio = COALESCE($4, bio),
       timezone = COALESCE($5, timezone),
       onboarding_state = COALESCE(onboarding_state, '{}'::jsonb) || COALESCE($6::jsonb, '{}'::jsonb),
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [
      accountId,
      patch.displayName ?? null,
      patch.specializations ?? null,
      patch.bio ?? null,
      patch.timezone ?? null,
      patch.onboardingState ? JSON.stringify(patch.onboardingState) : null,
    ]
  );
  if (patch.addressForm) {
    await proQuery(
      `UPDATE pro.style_profiles SET address_form = $2, updated_at = NOW() WHERE account_id = $1`,
      [accountId, patch.addressForm]
    );
  }
  return rows[0] ?? null;
}

export async function setAccountStatus(
  accountId: string | number,
  status: ProAccountRow["status"],
  adminUserId: string
): Promise<ProAccountRow | null> {
  const { rows } = await proQuery<ProAccountRow>(
    `UPDATE pro.accounts SET status = $2, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [accountId, status]
  );
  if (rows[0]) {
    await writeAudit({
      accountId,
      actor: "admin",
      actorUserId: adminUserId,
      action: "account.status",
      target: String(accountId),
      meta: { status },
    });
  }
  return rows[0] ?? null;
}

export async function setAccountTier(
  accountId: string | number,
  tier: ProAccountRow["tier"],
  adminUserId: string,
  opts?: { trialEndsAt?: string | null; trialRunes?: number | null }
): Promise<ProAccountRow | null> {
  const { rows } = await proQuery<ProAccountRow>(
    `UPDATE pro.accounts SET
       tier = $2,
       limits = limits
         || CASE WHEN $3::text IS NOT NULL
                 THEN jsonb_build_object('trial_ends_at', $3::text) ELSE '{}'::jsonb END
         || CASE WHEN $4::int IS NOT NULL
                 THEN jsonb_build_object('trial_runes', $4::int) ELSE '{}'::jsonb END,
       updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [accountId, tier, opts?.trialEndsAt ?? null, opts?.trialRunes ?? null]
  );
  if (rows[0]) {
    await writeAudit({
      accountId,
      actor: "admin",
      actorUserId: adminUserId,
      action: "account.tier",
      target: String(accountId),
      meta: {
        tier,
        trial_ends_at: opts?.trialEndsAt ?? undefined,
        trial_runes: opts?.trialRunes ?? undefined,
      },
    });
  }
  return rows[0] ?? null;
}

export async function listAccounts(limit = 100): Promise<ProAccountRow[]> {
  const { rows } = await proQuery<ProAccountRow>(
    `SELECT * FROM pro.accounts WHERE deleted_at IS NULL
     ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function writeAudit(input: {
  accountId?: string | number | null;
  actor: "user" | "admin" | "system";
  actorUserId?: string | null;
  action: string;
  target?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await proQuery(
    `INSERT INTO pro.audit_log (account_id, actor, actor_user_id, action, target, meta)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.accountId ?? null,
      input.actor,
      input.actorUserId ?? null,
      input.action,
      input.target ?? null,
      JSON.stringify(input.meta ?? {}),
    ]
  );
}
