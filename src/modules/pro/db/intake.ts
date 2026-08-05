import { proQuery } from "../db";
import { mintProToken, hashProToken } from "../tokens";
import { createClient } from "./clients";
import { createCase, setCaseInput } from "./cases";
import { writeAudit } from "./accounts";

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

export async function submitIntake(
  rawToken: string,
  answers: {
    alias: string;
    question?: string;
    birthDate?: string;
    birthPlace?: string;
    birthTz?: string;
    consentPdn?: boolean;
  },
  ipHash?: string | null
): Promise<{ clientId: string; caseId: string }> {
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
      birthTz: answers.birthTz ?? null,
      source: "intake",
      consentConfirmed: true,
    },
    form.account_id
  );

  const c = await createCase(
    form.account_id,
    {
      clientId: client.id,
      type: "manual_spread",
      question: answers.question ?? null,
    },
    form.account_id
  );

  await setCaseInput(form.account_id, c.id, {
    from_intake: true,
    birthDate: answers.birthDate ?? null,
    birthPlace: answers.birthPlace ?? null,
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

  return { clientId: client.id, caseId: c.id };
}
