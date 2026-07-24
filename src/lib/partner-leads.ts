/**
 * Inbound partnership leads from the guest landing form.
 * Separate from support tickets — own admin inbox.
 */
import { query } from "@/lib/db";

export type PartnerLeadStatus = "new" | "in_progress" | "done" | "spam";

export interface PartnerLeadRow {
  id: string;
  contact_name: string;
  phone: string;
  email: string;
  company: string;
  website: string | null;
  message: string;
  status: PartnerLeadStatus;
  admin_note: string | null;
  created_at: Date;
  updated_at: Date;
}

export const PARTNER_LEAD_STATUS_LABELS: Record<PartnerLeadStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  done: "Закрыта",
  spam: "Спам",
};

const MAX_NAME = 120;
const MAX_PHONE = 40;
const MAX_EMAIL = 200;
const MAX_COMPANY = 200;
const MAX_WEBSITE = 300;
const MAX_MESSAGE = 4000;
const MAX_NOTE = 2000;

export function isValidPartnerLeadStatus(v: string): v is PartnerLeadStatus {
  return ["new", "in_progress", "done", "spam"].includes(v);
}

function sanitize(text: string, maxLen: number): string {
  return text.replace(/\0/g, "").trim().slice(0, maxLen);
}

export function normalizePartnerPhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, "").trim();
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return sanitize(cleaned, MAX_PHONE) || null;
}

export function normalizePartnerEmail(raw: string): string | null {
  const email = sanitize(raw, MAX_EMAIL).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function createPartnerLead(input: {
  contactName: string;
  phone: string;
  email: string;
  company: string;
  website?: string | null;
  message: string;
}): Promise<PartnerLeadRow> {
  const contactName = sanitize(input.contactName, MAX_NAME);
  const phone = normalizePartnerPhone(input.phone);
  const email = normalizePartnerEmail(input.email);
  const company = sanitize(input.company, MAX_COMPANY);
  const website = input.website ? sanitize(input.website, MAX_WEBSITE) : null;
  const message = sanitize(input.message, MAX_MESSAGE);

  if (!contactName) throw new Error("name_required");
  if (!phone) throw new Error("phone_invalid");
  if (!email) throw new Error("email_invalid");
  if (!company) throw new Error("company_required");
  if (!message || message.length < 10) throw new Error("message_required");

  const { rows } = await query<PartnerLeadRow>(
    `INSERT INTO partner_leads
       (contact_name, phone, email, company, website, message, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'new')
     RETURNING *`,
    [contactName, phone, email, company, website || null, message]
  );
  return rows[0];
}

export async function listPartnerLeads(params: {
  status?: PartnerLeadStatus | "all";
  limit?: number;
  offset?: number;
}): Promise<PartnerLeadRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const status = params.status && params.status !== "all" ? params.status : null;

  if (status) {
    const { rows } = await query<PartnerLeadRow>(
      `SELECT * FROM partner_leads
       WHERE status = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    return rows;
  }

  const { rows } = await query<PartnerLeadRow>(
    `SELECT * FROM partner_leads
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function getPartnerLeadStats(): Promise<{
  newCount: number;
  inProgress: number;
  total: number;
}> {
  const { rows } = await query<{ new_count: string; in_progress: string; total: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'new')::text AS new_count,
       COUNT(*) FILTER (WHERE status = 'in_progress')::text AS in_progress,
       COUNT(*)::text AS total
     FROM partner_leads`
  );
  const row = rows[0];
  return {
    newCount: Number(row?.new_count ?? 0),
    inProgress: Number(row?.in_progress ?? 0),
    total: Number(row?.total ?? 0),
  };
}

export async function getPartnerLead(id: string): Promise<PartnerLeadRow | null> {
  if (!id) return null;
  const { rows } = await query<PartnerLeadRow>(
    `SELECT * FROM partner_leads WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updatePartnerLead(params: {
  id: string;
  status?: PartnerLeadStatus;
  adminNote?: string | null;
}): Promise<PartnerLeadRow | null> {
  const status = params.status;
  const note =
    params.adminNote === undefined
      ? undefined
      : params.adminNote === null
        ? null
        : sanitize(params.adminNote, MAX_NOTE);

  if (!status && note === undefined) {
    return getPartnerLead(params.id);
  }

  const { rows } = await query<PartnerLeadRow>(
    `UPDATE partner_leads
     SET status = COALESCE($2, status),
         admin_note = CASE WHEN $3::boolean THEN $4 ELSE admin_note END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [params.id, status ?? null, note !== undefined, note ?? null]
  );
  return rows[0] ?? null;
}
