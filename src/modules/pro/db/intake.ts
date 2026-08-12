import { proQuery } from "../db";
import { mintProToken, hashProToken } from "../tokens";
import { createClient } from "./clients";
import { createCase, setCaseInput } from "./cases";
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
}

/** Public-safe form meta for the /pro/f/[token] page (no token echoes). */
export async function getIntakeFormPublicMeta(
  rawToken: string
): Promise<{ name: string; practitionerName: string | null } | null> {
  const hash = hashProToken(rawToken);
  const { rows } = await proQuery<{
    name: string;
    practitioner_name: string | null;
  }>(
    `SELECT f.name, a.display_name AS practitioner_name
     FROM pro.intake_forms f
     JOIN pro.accounts a ON a.id = f.account_id
     WHERE f.token_hash = $1 AND f.active = TRUE AND a.deleted_at IS NULL
     LIMIT 1`,
    [hash]
  );
  const row = rows[0];
  if (!row) return null;
  return { name: row.name, practitionerName: row.practitioner_name };
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
    active: boolean;
  }>(
    `SELECT id, account_id, active FROM pro.intake_forms WHERE token_hash = $1 LIMIT 1`,
    [hash]
  );
  const form = rows[0];
  if (!form || !form.active) {
    throw Object.assign(new Error("intake_not_found"), { status: 404 });
  }
  if (!answers.consentPdn) {
    throw Object.assign(new Error("consent_required"), { status: 400 });
  }

  const client = await createClient(
    form.account_id,
    {
      alias: answers.alias,
      birthDate: answers.birthDate ?? null,
      birthPlace: answers.birthPlace ?? null,
      birthLat: answers.birthLat ?? null,
      birthLon: answers.birthLon ?? null,
      birthTz: answers.birthTz ?? null,
      source: "intake",
      consentConfirmed: true,
      consentMethod: "intake_form",
    },
    form.account_id
  );

  const caseType = resolveIntakeCaseType(answers.caseType);

  const c = await createCase(
    form.account_id,
    {
      clientId: client.id,
      type: caseType,
      question: answers.question ?? null,
    },
    form.account_id
  );

  await setCaseInput(form.account_id, c.id, {
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
  });

  await proQuery(
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
  await proQuery(
    `UPDATE pro.landings
     SET promo_used = promo_used + 1, updated_at = NOW()
     WHERE account_id = $1 AND intake_form_id = $2
       AND promo_limit IS NOT NULL AND promo_used < promo_limit`,
    [form.account_id, form.id]
  );

  return { clientId: client.id, caseId: c.id, accountId: form.account_id };
}
