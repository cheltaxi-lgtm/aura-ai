import { proQuery } from "../db";
import {
  DEFAULT_LANDING_COPY,
  DEFAULT_LANDING_SECTIONS,
  normalizeLandingSections,
  type ProLandingPublicPayload,
  type ProLandingSections,
} from "../landing-defaults";
import { createIntakeLink } from "./intake";
import { writeAudit } from "./accounts";
import {
  encryptProSecret,
  isEncryptedProSecret,
  resolveProCapabilityUrl,
} from "../token-crypto";

export type { ProLandingPublicPayload };

export type ProLandingRow = {
  account_id: string;
  published: boolean;
  headline: string | null;
  subheadline: string | null;
  promo_badge: string | null;
  price_rub: number | null;
  promo_limit: number | null;
  promo_used: number;
  sections: ProLandingSections;
  contact_note: string | null;
  intake_form_id: string | null;
  intake_url: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapRow(r: {
  account_id: string | number;
  published: boolean;
  headline: string | null;
  subheadline: string | null;
  promo_badge: string | null;
  price_rub: number | null;
  promo_limit: number | null;
  promo_used: number;
  sections: unknown;
  contact_note: string | null;
  intake_form_id: string | number | null;
  intake_url: string | null;
  created_at: Date;
  updated_at: Date;
}): ProLandingRow {
  return {
    account_id: String(r.account_id),
    published: Boolean(r.published),
    headline: r.headline,
    subheadline: r.subheadline,
    promo_badge: r.promo_badge,
    price_rub: r.price_rub == null ? null : Number(r.price_rub),
    promo_limit: r.promo_limit == null ? null : Number(r.promo_limit),
    promo_used: Number(r.promo_used) || 0,
    sections: normalizeLandingSections(r.sections),
    contact_note: r.contact_note,
    intake_form_id: r.intake_form_id == null ? null : String(r.intake_form_id),
    intake_url: resolveProCapabilityUrl(r.intake_url),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/** Legacy plaintext capability URLs get encrypted on first read (lazy migration). */
async function reencryptIntakeUrlIfPlaintext(
  accountId: string | number,
  stored: string | null
): Promise<void> {
  if (!stored || !stored.startsWith("/") || isEncryptedProSecret(stored)) return;
  await proQuery(
    `UPDATE pro.landings SET intake_url = $2 WHERE account_id = $1 AND intake_url = $3`,
    [accountId, encryptProSecret(stored), stored]
  ).catch(() => {});
}

/** Ensure a landing row exists (defaults from Avito skeleton). */
export async function ensureLanding(accountId: string | number): Promise<ProLandingRow> {
  const existing = await getLandingByAccountId(accountId);
  if (existing) return existing;

  const { rows } = await proQuery<{
    account_id: string | number;
    published: boolean;
    headline: string | null;
    subheadline: string | null;
    promo_badge: string | null;
    price_rub: number | null;
    promo_limit: number | null;
    promo_used: number;
    sections: unknown;
    contact_note: string | null;
    intake_form_id: string | number | null;
    intake_url: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO pro.landings (
       account_id, headline, subheadline, promo_badge, price_rub, promo_limit, sections, contact_note
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (account_id) DO UPDATE SET updated_at = pro.landings.updated_at
     RETURNING *`,
    [
      accountId,
      DEFAULT_LANDING_COPY.headline,
      DEFAULT_LANDING_COPY.subheadline,
      DEFAULT_LANDING_COPY.promo_badge,
      DEFAULT_LANDING_COPY.price_rub,
      DEFAULT_LANDING_COPY.promo_limit,
      JSON.stringify(DEFAULT_LANDING_SECTIONS),
      DEFAULT_LANDING_COPY.contact_note,
    ]
  );
  return mapRow(rows[0]!);
}

export async function getLandingByAccountId(
  accountId: string | number
): Promise<ProLandingRow | null> {
  const { rows } = await proQuery<{
    account_id: string | number;
    published: boolean;
    headline: string | null;
    subheadline: string | null;
    promo_badge: string | null;
    price_rub: number | null;
    promo_limit: number | null;
    promo_used: number;
    sections: unknown;
    contact_note: string | null;
    intake_form_id: string | number | null;
    intake_url: string | null;
    created_at: Date;
    updated_at: Date;
  }>(`SELECT * FROM pro.landings WHERE account_id = $1 LIMIT 1`, [accountId]);
  if (!rows[0]) return null;
  await reencryptIntakeUrlIfPlaintext(accountId, rows[0].intake_url);
  return mapRow(rows[0]);
}

export type ProLandingPatch = {
  published?: boolean;
  headline?: string | null;
  subheadline?: string | null;
  promo_badge?: string | null;
  price_rub?: number | null;
  promo_limit?: number | null;
  promo_used?: number;
  sections?: ProLandingSections;
  contact_note?: string | null;
};

export async function updateLanding(
  accountId: string | number,
  patch: ProLandingPatch,
  actorUserId: string
): Promise<ProLandingRow> {
  await ensureLanding(accountId);
  const sectionsJson =
    patch.sections !== undefined ? JSON.stringify(normalizeLandingSections(patch.sections)) : null;

  const { rows } = await proQuery<{
    account_id: string | number;
    published: boolean;
    headline: string | null;
    subheadline: string | null;
    promo_badge: string | null;
    price_rub: number | null;
    promo_limit: number | null;
    promo_used: number;
    sections: unknown;
    contact_note: string | null;
    intake_form_id: string | number | null;
    intake_url: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE pro.landings SET
       published = COALESCE($2, published),
       headline = COALESCE($3, headline),
       subheadline = COALESCE($4, subheadline),
       promo_badge = COALESCE($5, promo_badge),
       price_rub = CASE WHEN $6::boolean THEN $7 ELSE price_rub END,
       promo_limit = CASE WHEN $8::boolean THEN $9 ELSE promo_limit END,
       promo_used = COALESCE($10, promo_used),
       sections = COALESCE($11::jsonb, sections),
       contact_note = COALESCE($12, contact_note),
       updated_at = NOW()
     WHERE account_id = $1
     RETURNING *`,
    [
      accountId,
      patch.published ?? null,
      patch.headline !== undefined ? patch.headline : null,
      patch.subheadline !== undefined ? patch.subheadline : null,
      patch.promo_badge !== undefined ? patch.promo_badge : null,
      patch.price_rub !== undefined,
      patch.price_rub ?? null,
      patch.promo_limit !== undefined,
      patch.promo_limit ?? null,
      patch.promo_used !== undefined ? patch.promo_used : null,
      sectionsJson,
      patch.contact_note !== undefined ? patch.contact_note : null,
    ]
  );

  let row = mapRow(rows[0]!);

  // Publishing requires a bound intake capability URL.
  if (row.published && (!row.intake_url || !row.intake_form_id)) {
    row = await ensureLandingIntake(accountId, actorUserId);
  }

  await writeAudit({
    accountId,
    actor: "user",
    actorUserId,
    action: "landing.update",
    target: String(accountId),
    meta: { published: row.published },
  });

  return row;
}

/** Mint intake once and store public path on the landing. */
export async function ensureLandingIntake(
  accountId: string | number,
  actorUserId: string
): Promise<ProLandingRow> {
  const current = await ensureLanding(accountId);
  if (current.intake_url && current.intake_form_id) {
    const active = await proQuery<{ id: string }>(
      `SELECT id FROM pro.intake_forms
       WHERE id = $1 AND account_id = $2 AND active = TRUE LIMIT 1`,
      [current.intake_form_id, accountId]
    );
    if (active.rows[0]) return current;
  }

  const link = await createIntakeLink(accountId, actorUserId, "Минилендинг · заявка");
  const url = encryptProSecret(`/pro/f/${link.rawToken}`);
  const { rows } = await proQuery<{
    account_id: string | number;
    published: boolean;
    headline: string | null;
    subheadline: string | null;
    promo_badge: string | null;
    price_rub: number | null;
    promo_limit: number | null;
    promo_used: number;
    sections: unknown;
    contact_note: string | null;
    intake_form_id: string | number | null;
    intake_url: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE pro.landings SET
       intake_form_id = $2, intake_url = $3, updated_at = NOW()
     WHERE account_id = $1
     RETURNING *`,
    [accountId, link.formId, url]
  );
  return mapRow(rows[0]!);
}

/** Public lookup: active account + published landing + slug. */
export async function getPublishedLandingBySlug(
  slug: string
): Promise<ProLandingPublicPayload | null> {
  const clean = slug.trim().toLowerCase().slice(0, 64);
  if (!clean || !/^[a-z0-9а-яё-]+$/i.test(clean)) return null;

  const { rows } = await proQuery<{
    account_id: string | number;
    brand_slug: string;
    display_name: string | null;
    bio: string | null;
    specializations: string[] | null;
    accent_color: string | null;
    logo_url: string | null;
    contact_public: string | null;
    headline: string | null;
    subheadline: string | null;
    promo_badge: string | null;
    price_rub: number | null;
    promo_limit: number | null;
    promo_used: number;
    sections: unknown;
    contact_note: string | null;
    intake_url: string | null;
  }>(
    `SELECT
       l.account_id,
       a.brand_slug,
       a.display_name,
       a.bio,
       a.specializations,
       b.accent_color,
       b.logo_url,
       b.contact_public,
       l.headline,
       l.subheadline,
       l.promo_badge,
       l.price_rub,
       l.promo_limit,
       l.promo_used,
       l.sections,
       l.contact_note,
       l.intake_url
     FROM pro.landings l
     JOIN pro.accounts a ON a.id = l.account_id
     LEFT JOIN pro.brand b ON b.account_id = a.id
     WHERE lower(a.brand_slug) = $1
       AND a.status = 'active'
       AND a.deleted_at IS NULL
       AND l.published = TRUE
       AND l.intake_url IS NOT NULL
     LIMIT 1`,
    [clean]
  );
  const r = rows[0];
  if (!r?.intake_url) return null;
  const intakeUrl = resolveProCapabilityUrl(r.intake_url);
  if (!intakeUrl) return null;
  await reencryptIntakeUrlIfPlaintext(r.account_id, r.intake_url);

  const sections = normalizeLandingSections(r.sections);
  const promoLimit = r.promo_limit == null ? null : Number(r.promo_limit);
  const promoUsed = Number(r.promo_used) || 0;
  const promoRemaining =
    promoLimit == null ? null : Math.max(0, promoLimit - promoUsed);

  return {
    slug: r.brand_slug,
    displayName: (r.display_name || "Практик").trim(),
    bio: r.bio,
    specializations: Array.isArray(r.specializations) ? r.specializations : [],
    accentColor: r.accent_color,
    logoUrl: r.logo_url,
    contactPublic: r.contact_public,
    headline: (r.headline || DEFAULT_LANDING_COPY.headline).trim(),
    subheadline: (r.subheadline || DEFAULT_LANDING_COPY.subheadline).trim(),
    promoBadge: r.promo_badge,
    priceRub: r.price_rub == null ? null : Number(r.price_rub),
    promoLimit,
    promoUsed,
    promoRemaining,
    sections,
    contactNote: r.contact_note,
    intakeUrl,
    ctaLabel: sections.cta || DEFAULT_LANDING_SECTIONS.cta,
  };
}
