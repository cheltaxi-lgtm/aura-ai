import { NextRequest, NextResponse } from "next/server";
import {
  applyApprovedMoneyChange,
  buildApprovalImpact,
  decideApproval,
} from "@/modules/ads/approvals";
import { getBudget, setConfigJson } from "@/modules/ads/config";
import { adsQuery } from "@/modules/ads/db";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";
import { applyHardTotalFromApproval } from "@/modules/ads/guard/budget";
import {
  ApprovalConfirmRequiredError,
  ApprovalExpiredError,
} from "@/modules/ads/guard/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  await adsQuery(
    `UPDATE ads.approval_request
     SET status = 'expired', decided_at = NOW()
     WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()`
  );

  const { rows } = await adsQuery<{
    id: string;
    kind: string;
    target_level: string | null;
    target_id: string | null;
    current_value: unknown;
    proposed_value: unknown;
    rationale_json: unknown;
    status: string;
    created_at: Date;
    expires_at: Date | null;
    decided_by: string | null;
    decided_at: Date | null;
  }>(
    `SELECT id, kind, target_level, target_id, current_value, proposed_value,
            rationale_json, status, created_at, expires_at, decided_by, decided_at
     FROM ads.approval_request
     ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 100`
  );

  const items = [];
  for (const r of rows) {
    const impact = await buildApprovalImpact(r);
    items.push({ ...r, impact });
  }
  const pending = items.filter((r) => r.status === "pending").length;
  return NextResponse.json({ items, pending });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdsAdmin({ stepUpRequest: req });
  if (!isAdsAdminAuth(gate)) return gate;
  const { auth } = gate;

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    decision?: "approved" | "rejected" | "apply" | "reject";
    confirmAmount?: number;
  };
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const decision =
    body.decision === "approved" || body.decision === "apply"
      ? "approved"
      : body.decision === "rejected" || body.decision === "reject"
        ? "rejected"
        : null;
  if (!decision) {
    return NextResponse.json({ error: "decision_required" }, { status: 400 });
  }

  let row;
  try {
    row = await decideApproval({
      id: body.id,
      decision,
      decidedBy: auth.sub,
      confirmAmount: body.confirmAmount,
    });
  } catch (e) {
    if (e instanceof ApprovalExpiredError) {
      return NextResponse.json({ error: "expired", code: e.code }, { status: 410 });
    }
    if (e instanceof ApprovalConfirmRequiredError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 }
      );
    }
    throw e;
  }
  if (!row) {
    return NextResponse.json({ error: "not_found_or_not_pending" }, { status: 404 });
  }

  let applyResult: { ok: boolean; reason?: string } | null = null;
  if (decision === "approved") {
    try {
      applyResult = await applyApprovedMoneyChange({
        approvalId: body.id,
        apply: async (proposed) => {
          if (row.kind === "mode_switch") return;
          const p =
            proposed && typeof proposed === "object"
              ? (proposed as Record<string, unknown>)
              : {};
          if (row.kind === "global_cap_increase") {
            const amount = Number(p.amount);
            if (Number.isFinite(amount)) {
              await applyHardTotalFromApproval(body.id!, amount);
            }
            return;
          }
          if (row.kind === "budget_increase" || row.kind === "bid_increase") {
            const budget = await getBudget();
            await setConfigJson("budget", { ...budget, ...p }, auth.sub);
          }
        },
      });
    } catch (e) {
      if (e instanceof ApprovalExpiredError) {
        return NextResponse.json({ error: "expired", code: e.code }, { status: 410 });
      }
      throw e;
    }
  }

  await writeAdsAdminAction({
    adminId: auth.sub,
    action: `approval_${decision}`,
    payload: { id: body.id, kind: row.kind },
    result: { applyResult },
    entityType: "ads_approval",
    entityId: body.id,
  });

  return NextResponse.json({ ok: true, item: row, applyResult });
}
