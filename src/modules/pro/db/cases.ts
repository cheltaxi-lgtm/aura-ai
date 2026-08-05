import { proQuery } from "../db";
import type { ProCaseStatus, ProCaseType, ProReportBlock } from "../domain/types";
import { PRO_MVP_CASE_TYPES } from "../domain/types";
import { getProMaxCasesPerDay } from "../config";
import { writeAudit } from "./accounts";

export type ProCaseRow = {
  id: string;
  account_id: string;
  client_id: string;
  type: ProCaseType;
  status: ProCaseStatus;
  question: string | null;
  practitioner_context: string | null;
  layout_id: string | null;
  ai_cost_runes: number;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ProCaseVersionRow = {
  id: string;
  case_id: string;
  version: number;
  source: "ai" | "human";
  blocks: ProReportBlock[];
  uncertainty_marks: unknown[];
  author_user_id: string | null;
  created_at: Date;
};

export async function countCasesToday(accountId: string | number): Promise<number> {
  const { rows } = await proQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM pro.cases
     WHERE account_id = $1 AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
    [accountId]
  );
  return Number(rows[0]?.n || 0);
}

export async function listCases(
  accountId: string | number,
  opts?: { status?: string; clientId?: string }
): Promise<ProCaseRow[]> {
  const { rows } = await proQuery<ProCaseRow>(
    `SELECT * FROM pro.cases
     WHERE account_id = $1
       AND ($2::text IS NULL OR status = $2)
       AND ($3::bigint IS NULL OR client_id = $3::bigint)
     ORDER BY updated_at DESC
     LIMIT 100`,
    [accountId, opts?.status ?? null, opts?.clientId ?? null]
  );
  return rows;
}

export async function getCase(
  accountId: string | number,
  caseId: string | number
): Promise<ProCaseRow | null> {
  const { rows } = await proQuery<ProCaseRow>(
    `SELECT * FROM pro.cases WHERE id = $1 AND account_id = $2 LIMIT 1`,
    [caseId, accountId]
  );
  return rows[0] ?? null;
}

export async function createCase(
  accountId: string | number,
  input: {
    clientId: string | number;
    type: ProCaseType;
    question?: string | null;
    practitionerContext?: string | null;
  },
  actorUserId: string
): Promise<ProCaseRow> {
  if (!PRO_MVP_CASE_TYPES.includes(input.type as (typeof PRO_MVP_CASE_TYPES)[number])) {
    throw Object.assign(new Error("unsupported_case_type"), { status: 400 });
  }
  const today = await countCasesToday(accountId);
  if (today >= getProMaxCasesPerDay()) {
    throw Object.assign(new Error("pro_case_daily_limit"), { status: 409 });
  }
  const { rows } = await proQuery<ProCaseRow>(
    `INSERT INTO pro.cases (account_id, client_id, type, status, question, practitioner_context)
     VALUES ($1, $2, $3, 'new', $4, $5)
     RETURNING *`,
    [
      accountId,
      input.clientId,
      input.type,
      input.question ?? null,
      input.practitionerContext ?? null,
    ]
  );
  await proQuery(
    `UPDATE pro.clients SET last_case_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND account_id = $2`,
    [input.clientId, accountId]
  );
  const actorIsUser = /^[0-9a-f-]{36}$/i.test(actorUserId);
  await writeAudit({
    accountId,
    actor: actorIsUser ? "user" : "system",
    actorUserId: actorIsUser ? actorUserId : null,
    action: "case.create",
    target: String(rows[0]!.id),
    meta: { type: input.type },
  });
  return rows[0]!;
}

export async function setCaseInput(
  accountId: string | number,
  caseId: string | number,
  payload: Record<string, unknown>,
  source: "manual" | "vision" | "transcript" | "voice" = "manual"
): Promise<ProCaseRow | null> {
  const c = await getCase(accountId, caseId);
  if (!c) return null;
  await proQuery(
    `INSERT INTO pro.case_inputs (case_id, payload, source)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (case_id) DO UPDATE SET payload = EXCLUDED.payload, source = EXCLUDED.source`,
    [caseId, JSON.stringify(payload), source]
  );
  const { rows } = await proQuery<ProCaseRow>(
    `UPDATE pro.cases SET status = 'input_ready', updated_at = NOW()
     WHERE id = $1 AND account_id = $2 RETURNING *`,
    [caseId, accountId]
  );
  return rows[0] ?? null;
}

export async function getCaseInput(
  caseId: string | number
): Promise<{ payload: Record<string, unknown>; source: string } | null> {
  const { rows } = await proQuery<{ payload: Record<string, unknown>; source: string }>(
    `SELECT payload, source FROM pro.case_inputs WHERE case_id = $1`,
    [caseId]
  );
  return rows[0] ?? null;
}

export async function listVersions(caseId: string | number): Promise<ProCaseVersionRow[]> {
  const { rows } = await proQuery<ProCaseVersionRow>(
    `SELECT * FROM pro.case_versions WHERE case_id = $1 ORDER BY version ASC`,
    [caseId]
  );
  return rows.map((r) => ({
    ...r,
    blocks: (Array.isArray(r.blocks) ? r.blocks : []) as ProReportBlock[],
    uncertainty_marks: Array.isArray(r.uncertainty_marks) ? r.uncertainty_marks : [],
  }));
}

export async function addVersion(
  accountId: string | number,
  caseId: string | number,
  input: {
    source: "ai" | "human";
    blocks: ProReportBlock[];
    uncertaintyMarks?: unknown[];
    authorUserId?: string | null;
    status?: ProCaseStatus;
    aiCostRunes?: number;
  }
): Promise<ProCaseVersionRow> {
  const c = await getCase(accountId, caseId);
  if (!c) throw Object.assign(new Error("case_not_found"), { status: 404 });
  const { rows: vmax } = await proQuery<{ m: number | null }>(
    `SELECT MAX(version) AS m FROM pro.case_versions WHERE case_id = $1`,
    [caseId]
  );
  const next = Number(vmax[0]?.m || 0) + 1;
  const { rows } = await proQuery<ProCaseVersionRow>(
    `INSERT INTO pro.case_versions
       (case_id, version, source, blocks, uncertainty_marks, author_user_id)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
     RETURNING *`,
    [
      caseId,
      next,
      input.source,
      JSON.stringify(input.blocks),
      JSON.stringify(input.uncertaintyMarks ?? []),
      input.authorUserId ?? null,
    ]
  );
  const status =
    input.status ?? (input.source === "human" ? "edited" : "draft");
  await proQuery(
    `UPDATE pro.cases SET status = $3, ai_cost_runes = ai_cost_runes + $4, updated_at = NOW()
     WHERE id = $1 AND account_id = $2`,
    [caseId, accountId, status, input.aiCostRunes ?? 0]
  );
  const row = rows[0]!;
  return {
    ...row,
    blocks: (Array.isArray(row.blocks) ? row.blocks : []) as ProReportBlock[],
    uncertainty_marks: Array.isArray(row.uncertainty_marks) ? row.uncertainty_marks : [],
  };
}

export async function markDelivered(
  accountId: string | number,
  caseId: string | number
): Promise<ProCaseRow | null> {
  const { rows } = await proQuery<ProCaseRow>(
    `UPDATE pro.cases SET status = 'delivered', delivered_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND account_id = $2 RETURNING *`,
    [caseId, accountId]
  );
  return rows[0] ?? null;
}
