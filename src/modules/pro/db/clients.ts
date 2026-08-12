import { proQuery } from "../db";
import { getProMaxClients } from "../config";
import { writeAudit } from "./accounts";

export type ProClientRow = {
  id: string;
  account_id: string;
  alias: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  birth_lat: number | null;
  birth_lon: number | null;
  birth_tz: string | null;
  gender: string | null;
  tags: string[];
  notes: string | null;
  consent_state: "unknown" | "confirmed" | "revoked";
  source: "manual" | "intake" | "import";
  last_case_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export async function countClients(accountId: string | number): Promise<number> {
  const { rows } = await proQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM pro.clients
     WHERE account_id = $1 AND deleted_at IS NULL`,
    [accountId]
  );
  return Number(rows[0]?.n || 0);
}

export async function listClients(
  accountId: string | number,
  q?: string
): Promise<ProClientRow[]> {
  if (q?.trim()) {
    const like = `%${q.trim().toLowerCase()}%`;
    const { rows } = await proQuery<ProClientRow>(
      `SELECT * FROM pro.clients
       WHERE account_id = $1 AND deleted_at IS NULL
         AND (LOWER(alias) LIKE $2 OR LOWER(COALESCE(full_name,'')) LIKE $2)
       ORDER BY COALESCE(last_case_at, created_at) DESC
       LIMIT 200`,
      [accountId, like]
    );
    return rows;
  }
  const { rows } = await proQuery<ProClientRow>(
    `SELECT * FROM pro.clients
     WHERE account_id = $1 AND deleted_at IS NULL
     ORDER BY COALESCE(last_case_at, created_at) DESC
     LIMIT 200`,
    [accountId]
  );
  return rows;
}

export async function getClient(
  accountId: string | number,
  clientId: string | number
): Promise<ProClientRow | null> {
  const { rows } = await proQuery<ProClientRow>(
    `SELECT * FROM pro.clients
     WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [clientId, accountId]
  );
  return rows[0] ?? null;
}

export async function createClient(
  accountId: string | number,
  input: {
    alias: string;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    birthDate?: string | null;
    birthTime?: string | null;
    birthPlace?: string | null;
    birthLat?: number | null;
    birthLon?: number | null;
    birthTz?: string | null;
    gender?: string | null;
    tags?: string[];
    notes?: string | null;
    source?: "manual" | "intake" | "import";
    consentConfirmed?: boolean;
    /** How consent was captured — recorded in pro.client_consents.method. */
    consentMethod?: "intake_form" | "practitioner_confirm";
  },
  actorUserId: string
): Promise<ProClientRow> {
  const n = await countClients(accountId);
  if (n >= getProMaxClients()) {
    throw Object.assign(new Error("pro_client_limit"), { status: 409 });
  }
  const alias = input.alias.trim().slice(0, 120);
  if (!alias) throw Object.assign(new Error("alias_required"), { status: 400 });

  const consent = input.consentConfirmed ? "confirmed" : "unknown";
  const { rows } = await proQuery<ProClientRow>(
    `INSERT INTO pro.clients (
       account_id, alias, full_name, email, phone,
       birth_date, birth_time, birth_place, birth_lat, birth_lon, birth_tz,
       gender, tags, notes, consent_state, source
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
     ) RETURNING *`,
    [
      accountId,
      alias,
      input.fullName ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.birthDate ?? null,
      input.birthTime ?? null,
      input.birthPlace ?? null,
      input.birthLat ?? null,
      input.birthLon ?? null,
      input.birthTz ?? null,
      input.gender ?? null,
      input.tags ?? [],
      input.notes ?? null,
      consent,
      input.source ?? "manual",
    ]
  );
  const client = rows[0]!;
  if (input.consentConfirmed) {
    const method =
      input.consentMethod ??
      (input.source === "intake" ? "intake_form" : "practitioner_confirm");
    await proQuery(
      `INSERT INTO pro.client_consents (client_id, kind, granted, doc_version, method, granted_at)
       VALUES ($1, 'pdn', TRUE, '2026-08-pro', $2, NOW())`,
      [client.id, method]
    );
  }
  const actorIsUser = /^[0-9a-f-]{36}$/i.test(actorUserId);
  await writeAudit({
    accountId,
    actor: actorIsUser ? "user" : "system",
    actorUserId: actorIsUser ? actorUserId : null,
    action: "client.create",
    target: String(client.id),
  });
  return client;
}

export async function updateClient(
  accountId: string | number,
  clientId: string | number,
  patch: Partial<{
    alias: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    birthDate: string | null;
    birthTime: string | null;
    birthPlace: string | null;
    birthLat: number | null;
    birthLon: number | null;
    birthTz: string | null;
    gender: string | null;
    tags: string[];
    notes: string | null;
  }>
): Promise<ProClientRow | null> {
  // birth_lat/lon/tz: undefined = keep; null = clear (COALESCE cannot clear).
  const { rows } = await proQuery<ProClientRow>(
    `UPDATE pro.clients SET
       alias = COALESCE($3, alias),
       full_name = COALESCE($4, full_name),
       email = COALESCE($5, email),
       phone = COALESCE($6, phone),
       birth_date = COALESCE($7, birth_date),
       birth_time = COALESCE($8, birth_time),
       birth_place = COALESCE($9, birth_place),
       birth_lat = CASE WHEN $16::boolean THEN $10 ELSE birth_lat END,
       birth_lon = CASE WHEN $17::boolean THEN $11 ELSE birth_lon END,
       birth_tz = CASE WHEN $18::boolean THEN $12 ELSE birth_tz END,
       gender = COALESCE($13, gender),
       tags = COALESCE($14, tags),
       notes = COALESCE($15, notes),
       updated_at = NOW()
     WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [
      clientId,
      accountId,
      patch.alias ?? null,
      patch.fullName === undefined ? null : patch.fullName,
      patch.email === undefined ? null : patch.email,
      patch.phone === undefined ? null : patch.phone,
      patch.birthDate === undefined ? null : patch.birthDate,
      patch.birthTime === undefined ? null : patch.birthTime,
      patch.birthPlace === undefined ? null : patch.birthPlace,
      patch.birthLat ?? null,
      patch.birthLon ?? null,
      patch.birthTz ?? null,
      patch.gender === undefined ? null : patch.gender,
      patch.tags ?? null,
      patch.notes === undefined ? null : patch.notes,
      patch.birthLat !== undefined,
      patch.birthLon !== undefined,
      patch.birthTz !== undefined,
    ]
  );
  return rows[0] ?? null;
}

export async function softDeleteClient(
  accountId: string | number,
  clientId: string | number,
  actorUserId: string
): Promise<boolean> {
  const { rowCount } = await proQuery(
    `UPDATE pro.clients SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL`,
    [clientId, accountId]
  );
  if (rowCount) {
    await writeAudit({
      accountId,
      actor: "user",
      actorUserId,
      action: "client.delete",
      target: String(clientId),
    });
  }
  return Boolean(rowCount);
}

export async function confirmClientConsent(
  accountId: string | number,
  clientId: string | number,
  actorUserId: string
): Promise<ProClientRow | null> {
  const client = await getClient(accountId, clientId);
  if (!client) return null;
  await proQuery(
    `UPDATE pro.clients SET consent_state = 'confirmed', updated_at = NOW()
     WHERE id = $1 AND account_id = $2`,
    [clientId, accountId]
  );
  await proQuery(
    `INSERT INTO pro.client_consents (client_id, kind, granted, doc_version, method, granted_at)
     VALUES ($1, 'pdn', TRUE, '2026-08-pro', 'practitioner_confirm', NOW())`,
    [clientId]
  );
  await writeAudit({
    accountId,
    actor: "user",
    actorUserId,
    action: "client.consent",
    target: String(clientId),
  });
  return getClient(accountId, clientId);
}
