/**
 * Approval requests — money increases only via approval.
 */
import { adsQuery } from "./db";
import { getBudget } from "./config";
import type { ApprovalKind } from "./types";
import {
  ApprovalConfirmRequiredError,
  ApprovalExpiredError,
} from "./guard/errors";
import { getHardBudgetConfig, sumLedgerAndStats } from "./guard/budget";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type ApprovalRow = {
  id: string;
  kind: ApprovalKind;
  target_level: string | null;
  target_id: string | null;
  current_value: unknown;
  proposed_value: unknown;
  rationale_json: unknown;
  status: ApprovalStatus;
  created_at: Date;
  expires_at: Date | null;
  decided_by: string | null;
  decided_at: Date | null;
};

const MONEY_KINDS: ApprovalKind[] = [
  "budget_increase",
  "bid_increase",
  "global_cap_increase",
];

export function isMoneyIncreaseKind(kind: ApprovalKind): boolean {
  return MONEY_KINDS.includes(kind);
}

/**
 * Create approval request. Never applies the change.
 * Money increases MUST go through this path.
 */
export async function createApprovalRequest(input: {
  kind: ApprovalKind;
  targetLevel?: string | null;
  targetId?: string | null;
  currentValue?: unknown;
  proposedValue?: unknown;
  rationale?: unknown;
}): Promise<ApprovalRow> {
  const budget = await getBudget();
  const ttlHours = budget.approval_ttl_hours || 48;

  // Guard: if proposed money value is lower — still allow (e.g. mode_switch),
  // but callers must not apply money ups without approval.
  const { rows } = await adsQuery<ApprovalRow>(
    `INSERT INTO ads.approval_request (
       kind, target_level, target_id, current_value, proposed_value,
       rationale_json, status, expires_at
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, 'pending',
       NOW() + ($7::text || ' hours')::interval
     )
     RETURNING *`,
    [
      input.kind,
      input.targetLevel ?? null,
      input.targetId ?? null,
      JSON.stringify(input.currentValue ?? null),
      JSON.stringify(input.proposedValue ?? null),
      JSON.stringify(input.rationale ?? null),
      String(ttlHours),
    ]
  );
  return rows[0];
}

/**
 * Decide an approval. Does NOT mutate Direct budgets here —
 * callers apply only after status === 'approved'.
 */
/** Impact preview for admin UI (B5). */
export async function buildApprovalImpact(row: {
  kind: string;
  current_value: unknown;
  proposed_value: unknown;
}): Promise<{
  currentRub: number | null;
  proposedRub: number | null;
  deltaDayRub: number | null;
  delta30dRub: number | null;
  budgetRemainRub: number | null;
  daysAfterApply: number | null;
  requiresTypedConfirm: boolean;
}> {
  const cur =
    row.current_value && typeof row.current_value === "object"
      ? Number((row.current_value as Record<string, unknown>).amount ?? NaN)
      : NaN;
  const prop =
    row.proposed_value && typeof row.proposed_value === "object"
      ? Number((row.proposed_value as Record<string, unknown>).amount ?? NaN)
      : NaN;
  const currentRub = Number.isFinite(cur) ? cur : null;
  const proposedRub = Number.isFinite(prop) ? prop : null;
  const deltaDayRub =
    currentRub != null && proposedRub != null ? proposedRub - currentRub : null;
  const delta30dRub = deltaDayRub != null ? deltaDayRub * 30 : null;
  let budgetRemainRub: number | null = null;
  let daysAfterApply: number | null = null;
  try {
    const { hardTotalRub } = await getHardBudgetConfig();
    const { spentRub } = await sumLedgerAndStats();
    budgetRemainRub = Math.max(0, hardTotalRub - spentRub);
    const pace = proposedRub != null && proposedRub > 0 ? proposedRub : null;
    if (pace && budgetRemainRub != null) {
      daysAfterApply = budgetRemainRub / pace;
    }
  } catch {
    /* ignore */
  }
  const requiresTypedConfirm =
    currentRub != null &&
    proposedRub != null &&
    currentRub > 0 &&
    proposedRub / currentRub > 2;
  return {
    currentRub,
    proposedRub,
    deltaDayRub,
    delta30dRub,
    budgetRemainRub,
    daysAfterApply,
    requiresTypedConfirm,
  };
}

export async function decideApproval(input: {
  id: string;
  decision: "approved" | "rejected";
  decidedBy: string;
  /** Required when spend increase >2× */
  confirmAmount?: number | null;
}): Promise<ApprovalRow | null> {
  // Expire stale first
  await adsQuery(
    `UPDATE ads.approval_request
     SET status = 'expired', decided_at = NOW()
     WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()`
  );

  const existing = await adsQuery<ApprovalRow>(
    `SELECT * FROM ads.approval_request WHERE id = $1::uuid`,
    [input.id]
  );
  const row0 = existing.rows[0];
  if (!row0) return null;
  if (row0.status === "expired") {
    throw new ApprovalExpiredError();
  }
  if (
    row0.status === "pending" &&
    row0.expires_at &&
    new Date(row0.expires_at).getTime() < Date.now()
  ) {
    await adsQuery(
      `UPDATE ads.approval_request SET status='expired', decided_at=NOW() WHERE id=$1::uuid`,
      [input.id]
    );
    throw new ApprovalExpiredError();
  }

  if (input.decision === "approved") {
    const impact = await buildApprovalImpact(row0);
    if (impact.requiresTypedConfirm) {
      if (
        impact.proposedRub == null ||
        input.confirmAmount == null ||
        Number(input.confirmAmount) !== Number(impact.proposedRub)
      ) {
        throw new ApprovalConfirmRequiredError(
          `Подтвердите сумму ${impact.proposedRub} вручную (рост расхода >2×)`
        );
      }
    }
  }

  const { rows } = await adsQuery<ApprovalRow>(
    `UPDATE ads.approval_request
     SET status = $2,
         decided_by = $3::uuid,
         decided_at = NOW()
     WHERE id = $1::uuid AND status = 'pending'
     RETURNING *`,
    [input.id, input.decision, input.decidedBy]
  );
  return rows[0] ?? null;
}

/** True if applying this delta would raise a money limit — must create approval instead. */
export function requiresMoneyApproval(input: {
  kind: ApprovalKind;
  current?: number | null;
  proposed?: number | null;
}): boolean {
  if (!isMoneyIncreaseKind(input.kind) && input.kind !== "budget_increase") {
    // optimization_goal_switch / new_landing / mode_switch also need approval,
    // but not because of money — callers always createApprovalRequest for those.
    return (
      input.kind === "optimization_goal_switch" ||
      input.kind === "new_landing" ||
      input.kind === "new_cluster" ||
      input.kind === "mode_switch" ||
      input.kind === "seo_content_change" ||
      input.kind === "seo_route_change" ||
      input.kind === "seo_safe_fix"
    );
  }
  const cur = input.current ?? 0;
  const prop = input.proposed ?? 0;
  return prop > cur;
}

/**
 * Apply a money config change only when an approved request exists.
 * Returns false if blocked (no approval / still pending).
 */
export async function applyApprovedMoneyChange(input: {
  approvalId: string;
  apply: (proposed: unknown) => Promise<void>;
}): Promise<{ ok: boolean; reason?: string }> {
  const { rows } = await adsQuery<ApprovalRow>(
    `SELECT * FROM ads.approval_request WHERE id = $1::uuid`,
    [input.approvalId]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "expired") {
    throw new ApprovalExpiredError();
  }
  if (row.status !== "approved") {
    return { ok: false, reason: `status_${row.status}` };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    await adsQuery(
      `UPDATE ads.approval_request SET status='expired' WHERE id=$1::uuid`,
      [input.approvalId]
    );
    throw new ApprovalExpiredError();
  }
  await input.apply(row.proposed_value);
  await adsQuery(
    `INSERT INTO ads.action_log (actor, action, payload_json, result_json)
     VALUES ('system', 'apply_approval', $1::jsonb, '{"ok":true}'::jsonb)`,
    [JSON.stringify({ approvalId: input.approvalId, kind: row.kind })]
  );
  return { ok: true };
}
