import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { LANDING_REVIEW_SEEDS } from "@/lib/landing-reviews-seed";
import {
  LANDING_REVIEW_BODY_MAX,
  LANDING_REVIEW_BODY_MIN,
  LANDING_REVIEW_NAME_MAX,
  LANDING_REVIEW_PAGE_SIZE,
  isLandingReviewProduct,
  type LandingReviewProduct,
  type LandingReviewStatus,
  type PublicLandingReview,
} from "@/lib/landing-reviews-shared";

export type LandingReviewRow = {
  id: string;
  seed_key: string | null;
  source: "seed" | "user";
  status: LandingReviewStatus;
  rating: number;
  author_name: string;
  city: string | null;
  product: LandingReviewProduct;
  body: string;
  user_account_id: string | null;
  admin_note: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
  published_at: string | null;
  created_at: string;
};

export type LandingReviewStats = {
  approved: number;
  pending: number;
  rejected: number;
  averageRating: number;
};

export function hashReviewIp(ip: string): string {
  return createHash("sha256").update(`landing-review:v1:${ip}`).digest("hex").slice(0, 32);
}

export function landingReviewsEnabled(): boolean {
  return process.env.LANDING_REVIEWS_ENABLED !== "false";
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

export function sanitizeReviewName(raw: string): string {
  return stripTags(raw)
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LANDING_REVIEW_NAME_MAX);
}

export function sanitizeReviewBody(raw: string): string {
  return stripTags(raw)
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LANDING_REVIEW_BODY_MAX);
}

export function sanitizeReviewCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const city = stripTags(raw)
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  return city || null;
}

export function parseReviewRating(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

const NAME_RE = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s.-]{0,38}[A-Za-zА-Яа-яЁё.]$/;

export function validateReviewSubmission(input: {
  name: string;
  body: string;
  rating: number | null;
  product: string;
}): { ok: true; name: string; body: string; rating: number; product: LandingReviewProduct } | { ok: false; error: string } {
  const name = sanitizeReviewName(input.name);
  const body = sanitizeReviewBody(input.body);
  if (name.length < 2 || !NAME_RE.test(name)) return { ok: false, error: "name_invalid" };
  if (body.length < LANDING_REVIEW_BODY_MIN) return { ok: false, error: "body_short" };
  if (body.length > LANDING_REVIEW_BODY_MAX) return { ok: false, error: "body_long" };
  if (!input.rating) return { ok: false, error: "rating_invalid" };
  if (!isLandingReviewProduct(input.product)) return { ok: false, error: "product_invalid" };
  return { ok: true, name, body, rating: input.rating, product: input.product };
}

function toPublic(row: {
  id: string;
  rating: number;
  author_name: string;
  city: string | null;
  product: LandingReviewProduct;
  body: string;
  published_at: string | Date | null;
}): PublicLandingReview {
  const published =
    row.published_at instanceof Date
      ? row.published_at.toISOString()
      : row.published_at ?? new Date().toISOString();
  return {
    id: row.id,
    rating: row.rating,
    authorName: row.author_name,
    city: row.city,
    product: row.product,
    body: row.body,
    publishedAt: published,
  };
}

let seedPromise: Promise<void> | null = null;

export async function ensureLandingReviewSeed(): Promise<void> {
  if (seedPromise) {
    await seedPromise;
    return;
  }
  seedPromise = (async () => {
    const { rows } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM landing_reviews WHERE source = 'seed'`
    );
    if (Number.parseInt(rows[0]?.n ?? "0", 10) >= LANDING_REVIEW_SEEDS.length) return;

    const now = Date.now();
    for (const seed of LANDING_REVIEW_SEEDS) {
      const published = new Date(now - seed.daysAgo * 86_400_000 - (seed.key.charCodeAt(2) % 11) * 3_600_000);
      await query(
        `INSERT INTO landing_reviews (
           seed_key, source, status, rating, author_name, city, product, body, published_at
         ) VALUES ($1, 'seed', 'approved', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (seed_key) DO NOTHING`,
        [seed.key, seed.rating, seed.name, seed.city, seed.product, seed.body, published.toISOString()]
      );
    }
  })().finally(() => {
    seedPromise = null;
  });
  await seedPromise;
}

export async function getApprovedReviewSummary(): Promise<{ count: number; averageRating: number }> {
  const { rows } = await query<{ count: string; avg: string | null }>(
    `SELECT COUNT(*)::text AS count, ROUND(AVG(rating)::numeric, 1)::text AS avg
     FROM landing_reviews WHERE status = 'approved'`
  );
  return {
    count: Number.parseInt(rows[0]?.count ?? "0", 10),
    averageRating: Number.parseFloat(rows[0]?.avg ?? "0") || 0,
  };
}

export async function listApprovedReviews(opts: {
  limit?: number;
  cursorPublishedAt?: string | null;
  cursorId?: string | null;
}): Promise<{ items: PublicLandingReview[]; nextCursor: { publishedAt: string; id: string } | null }> {
  const limit = Math.min(Math.max(opts.limit ?? LANDING_REVIEW_PAGE_SIZE, 1), 24);
  const params: unknown[] = [];
  let where = `status = 'approved'`;
  if (opts.cursorPublishedAt && opts.cursorId) {
    params.push(opts.cursorPublishedAt, opts.cursorId);
    where += ` AND (published_at, id) < ($1::timestamptz, $2::uuid)`;
  }
  params.push(limit + 1);
  const limitIdx = params.length;
  const { rows } = await query<{
    id: string;
    rating: number;
    author_name: string;
    city: string | null;
    product: LandingReviewProduct;
    body: string;
    published_at: Date;
  }>(
    `SELECT id, rating, author_name, city, product, body, published_at
     FROM landing_reviews
     WHERE ${where}
     ORDER BY published_at DESC, id DESC
     LIMIT $${limitIdx}`,
    params
  );
  const extra = rows.length > limit;
  const slice = extra ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  return {
    items: slice.map(toPublic),
    nextCursor: extra && last ? { publishedAt: last.published_at.toISOString(), id: last.id } : null,
  };
}

export async function createUserReview(input: {
  name: string;
  city: string | null;
  body: string;
  rating: number;
  product: LandingReviewProduct;
  userAccountId: string | null;
  ipHash: string;
}): Promise<{ id: string }> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO landing_reviews (
       source, status, rating, author_name, city, product, body, user_account_id, ip_hash
     ) VALUES ('user', 'pending', $1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [input.rating, input.name, input.city, input.product, input.body, input.userAccountId, input.ipHash]
  );
  return { id: rows[0].id };
}

export async function hasRecentPendingReview(opts: {
  userAccountId: string | null;
  ipHash: string;
}): Promise<boolean> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM landing_reviews
     WHERE source = 'user'
       AND status = 'pending'
       AND created_at > NOW() - INTERVAL '24 hours'
       AND (
         ($1::uuid IS NOT NULL AND user_account_id = $1)
         OR ip_hash = $2
       )`,
    [opts.userAccountId, opts.ipHash]
  );
  return Number.parseInt(rows[0]?.n ?? "0", 10) > 0;
}

export async function listAdminReviews(opts: {
  status: LandingReviewStatus | "all";
  limit?: number;
  offset?: number;
}): Promise<LandingReviewRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const params: unknown[] = [];
  let where = "TRUE";
  if (opts.status !== "all") {
    params.push(opts.status);
    where = `status = $1`;
  }
  params.push(limit, offset);
  const { rows } = await query<LandingReviewRow>(
    `SELECT id, seed_key, source, status, rating, author_name, city, product, body,
            user_account_id, admin_note, moderated_by, moderated_at::text, published_at::text, created_at::text
     FROM landing_reviews
     WHERE ${where}
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export async function getAdminReviewStats(): Promise<LandingReviewStats> {
  const { rows } = await query<{ status: LandingReviewStatus; n: string; avg: string | null }>(
    `SELECT status, COUNT(*)::text AS n, ROUND(AVG(rating)::numeric, 1)::text AS avg
     FROM landing_reviews GROUP BY status`
  );
  const stats: LandingReviewStats = { approved: 0, pending: 0, rejected: 0, averageRating: 0 };
  for (const row of rows) {
    stats[row.status] = Number.parseInt(row.n, 10);
    if (row.status === "approved") stats.averageRating = Number.parseFloat(row.avg ?? "0") || 0;
  }
  return stats;
}

export async function moderateLandingReview(input: {
  id: string;
  status: "approved" | "rejected";
  adminNote?: string | null;
  moderator: string;
}): Promise<LandingReviewRow | null> {
  const { rows } = await query<LandingReviewRow>(
    `UPDATE landing_reviews SET
       status = $2,
       admin_note = COALESCE($3, admin_note),
       moderated_by = $4,
       moderated_at = NOW(),
       published_at = CASE WHEN $2 = 'approved' THEN COALESCE(published_at, NOW()) ELSE published_at END,
       updated_at = NOW()
     WHERE id = $1
     RETURNING id, seed_key, source, status, rating, author_name, city, product, body,
               user_account_id, admin_note, moderated_by, moderated_at::text, published_at::text, created_at::text`,
    [input.id, input.status, input.adminNote ?? null, input.moderator]
  );
  return rows[0] ?? null;
}

export async function updateLandingReviewNote(input: {
  id: string;
  adminNote: string;
  moderator: string;
}): Promise<LandingReviewRow | null> {
  const { rows } = await query<LandingReviewRow>(
    `UPDATE landing_reviews SET
       admin_note = $2,
       moderated_by = COALESCE(moderated_by, $3),
       updated_at = NOW()
     WHERE id = $1
     RETURNING id, seed_key, source, status, rating, author_name, city, product, body,
               user_account_id, admin_note, moderated_by, moderated_at::text, published_at::text, created_at::text`,
    [input.id, input.adminNote.slice(0, 500), input.moderator]
  );
  return rows[0] ?? null;
}
