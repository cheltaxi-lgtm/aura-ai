import { proQuery, getProPool } from "../db";
import { withActiveProfile } from "@/lib/active-profile";
import { getProMaxClients, getProMaxCasesPerDay } from "../config";
import { mintProToken, hashProToken } from "../tokens";
import { writeAudit } from "./accounts";
import type { ProCaseType } from "../domain/types";
import { PRO_BIRTH_CASE_TYPES, PRO_MVP_CASE_TYPES } from "../domain/types";

const INTAKE_CASE_TYPES = new Set<ProCaseType>([
  ...PRO_BIRTH_CASE_TYPES,
  "manual_spread",
]);

function resolveIntakeCaseType(raw: unknown): ProCaseType {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (
    INTAKE_CASE_TYPES.has(t as ProCaseType) &&
    PRO_MVP_CASE_TYPES.includes(t as (typeof PRO_MVP_CASE_TYPES)[number])
  ) {
    return t as ProCaseType;
  }
  return "manual_spread";
}

export async function createIntakeLink(
  accountId: string | number,
  actorUserId: string,
  name = "Бриф клиента"
): Promise<{ rawToken: string; formId: string }> {
  const owner = (await proQuery<{ user_id: string }>(
    `SELECT user_id FROM pro.accounts WHERE id = $1 AND user_id = $2 AND status = 'active' AND deleted_at IS NULL`, [accountId, actorUserId]
  )).rows[0];
  if (!owner) throw Object.assign(new Error("intake_not_found"), { status: 404 });
  const result = await withActiveProfile(owner.user_id, async () => {
    const minted = mintProToken("zf");
    const { rows } = await proQuery<{ id: string }>(
      `INSERT INTO pro.intake_forms (account_id, name, token_hash, token_prefix, schema)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id`,
      [
        accountId,
        name,
        minted.hash,
        minted.tokenPrefix,
        JSON.stringify({
          fields: ["alias", "question", "birthDate", "birthPlace"],
        }),
      ]
    );
    await writeAudit({
      accountId,
      actor: "user",
      actorUserId,
      action: "intake.create",
      target: String(rows[0]!.id),
    });
    return { rawToken: minted.raw, formId: rows[0]!.id };
  });
  if (!result) throw Object.assign(new Error("intake_not_found"), { status: 404 });
  return result;
}

/** Public-safe form meta for the /pro/f/[token] page (no token echoes). */
export async function getIntakeFormPublicMeta(
  rawToken: string
): Promise<{ name: string; practitionerName: string | null } | null> {
  const hash = hashProToken(rawToken);
  const { rows } = await proQuery<{
    name: string;
    practitioner_name: string | null;
    user_id: string;
  }>(
    `SELECT f.name, a.display_name AS practitioner_name, a.user_id
     FROM pro.intake_forms f
     JOIN pro.accounts a ON a.id = f.account_id
     WHERE f.token_hash = $1 AND f.active = TRUE AND a.deleted_at IS NULL AND a.status = 'active'
     LIMIT 1`,
    [hash]
  );
  const row = rows[0];
  if (!row) return null;
  return withActiveProfile(row.user_id, async () => ({ name: row.name, practitionerName: row.practitioner_name }));
}

export async function submitIntake(
  rawToken: string,
  answers: {
    alias: string;
    question?: string;
    birthDate?: string;
    birthPlace?: string;
    birthTime?: string;
    birthTz?: string;
    birthLat?: number | null;
    birthLon?: number | null;
    caseType?: string;
    consentPdn?: boolean;
  },
  ipHash?: string | null
): Promise<{ clientId: string; caseId: string; accountId: string }> {
  const hash = hashProToken(rawToken);
  const { rows } = await proQuery<{
    id: string;
    account_id: string;
    user_id: string;
  }>(
    `SELECT f.id, f.account_id, a.user_id FROM pro.intake_forms f JOIN pro.accounts a ON a.id = f.account_id
     WHERE f.token_hash = $1 AND f.active = TRUE AND a.status = 'active' AND a.deleted_at IS NULL LIMIT 1`,
    [hash]
  );
  const form = rows[0];
  if (!form) {
    throw Object.assign(new Error("intake_not_found"), { status: 404 });
  }
  if (!answers.consentPdn) {
    throw Object.assign(new Error("consent_required"), { status: 400 });
  }

  const alias = answers.alias.trim().slice(0, 120);
  if (!alias) throw Object.assign(new Error("alias_required"), { status: 400 });
  const caseType = resolveIntakeCaseType(answers.caseType);
  // Lock the main profile first: erasure acceptance cannot pass this bounded
  // operation even when Pro uses a separate database. All Pro writes commit
  // together, so an invalid/expired capability never leaves a partial client.
  const result = await withActiveProfile(form.user_id, async () => {
    const db = await getProPool().connect();
    try {
      await db.query("BEGIN");
      const active = await db.query(
        `SELECT f.id FROM pro.accounts a JOIN pro.intake_forms f ON f.account_id = a.id
         WHERE a.id = $1 AND a.user_id = $2 AND a.status = 'active' AND a.deleted_at IS NULL
           AND f.id = $3 AND f.token_hash = $4 AND f.active = TRUE FOR UPDATE OF a, f`,
        [form.account_id, form.user_id, form.id, hash]
      );
      if (!active.rows[0]) throw Object.assign(new Error("intake_not_found"), { status: 404 });
      const clients = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM pro.clients WHERE account_id = $1 AND deleted_at IS NULL`, [form.account_id]);
      if (Number(clients.rows[0].n) >= getProMaxClients()) throw Object.assign(new Error("pro_client_limit"), { status: 409 });
      const cases = await db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM pro.cases WHERE account_id = $1 AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`, [form.account_id]);
      if (Number(cases.rows[0].n) >= getProMaxCasesPerDay()) throw Object.assign(new Error("pro_case_daily_limit"), { status: 409 });
      const client = (await db.query<{ id: string }>(
        `INSERT INTO pro.clients (account_id, alias, birth_date, birth_time, birth_place, birth_lat, birth_lon, birth_tz, source, consent_state, last_case_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'intake', 'confirmed', NOW()) RETURNING id`,
        [form.account_id, alias, answers.birthDate ?? null, answers.birthTime ?? null, answers.birthPlace ?? null, answers.birthLat ?? null, answers.birthLon ?? null, answers.birthTz ?? null]
      )).rows[0];
      await db.query(`INSERT INTO pro.client_consents (client_id, kind, granted, doc_version, method, granted_at, ip_hash)
        VALUES ($1, 'pdn', TRUE, '2026-08-pro', 'intake_form', NOW(), $2)`, [client.id, ipHash ?? null]);
      const c = (await db.query<{ id: string }>(
        `INSERT INTO pro.cases (account_id, client_id, type, status, question) VALUES ($1, $2, $3, 'input_ready', $4) RETURNING id`,
        [form.account_id, client.id, caseType, answers.question ?? null]
      )).rows[0];
      await db.query(`INSERT INTO pro.case_inputs (case_id, payload, source) VALUES ($1, $2::jsonb, 'manual')`, [c.id, JSON.stringify({
        from_intake: true,
        caseType,
        birthDate: answers.birthDate ?? null,
        birthPlace: answers.birthPlace ?? null,
        birthTime: answers.birthTime ?? null,
        timeKnown: Boolean(answers.birthTime?.trim()),
        birthTz: answers.birthTz ?? null,
        birthLat: answers.birthLat ?? null,
        birthLon: answers.birthLon ?? null,
        latitude: answers.birthLat ?? null,
        longitude: answers.birthLon ?? null,
        timezone: answers.birthTz ?? null,
      })]);

      await db.query(
        `INSERT INTO pro.intake_responses
       (form_id, account_id, client_id, case_id, answers, consent_snapshot, ip_hash)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
        [
          form.id,
          form.account_id,
          client.id,
          c.id,
          JSON.stringify(answers),
          JSON.stringify({ pdn: true, version: "2026-08-pro" }),
          ipHash ?? null,
        ]
      );

      // Promo counter: single CAS update — never exceeds promo_limit even under
      // concurrent submissions. Only runs when the form backs a landing promo.
      await db.query(
        `UPDATE pro.landings
     SET promo_used = promo_used + 1, updated_at = NOW()
     WHERE account_id = $1 AND intake_form_id = $2
       AND promo_limit IS NOT NULL AND promo_used < promo_limit`,
        [form.account_id, form.id]
      );

      await db.query(`INSERT INTO pro.audit_log (account_id, actor, action, target, meta) VALUES
        ($1, 'system', 'client.create', $2, '{}'::jsonb), ($1, 'system', 'case.create', $3, $4::jsonb)`,
        [form.account_id, String(client.id), String(c.id), JSON.stringify({ type: caseType })]);
      await db.query("COMMIT");
      return { clientId: client.id, caseId: c.id, accountId: form.account_id };
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally { db.release(); }
  });
  if (!result) throw Object.assign(new Error("intake_not_found"), { status: 404 });
  return result;
}
