import { NextRequest, NextResponse } from "next/server";
import {
  applyApprovedMoneyChange,
  decideApproval,
} from "@/modules/ads/approvals";
import { getBudget, setConfigJson } from "@/modules/ads/config";
import { adsQuery } from "@/modules/ads/db";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";

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

  const { rows } = await adsQuery(
    `SELECT id, kind, target_level, target_id, current_value, proposed_value,
            rationale_json, status, created_at, expires_at, decided_by, decided_at
     FROM ads.approval_request
     ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 100`
  );
  const pending = rows.filter((r) => r.status === "pending").length;
  return NextResponse.json({ items: rows, pending });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const { auth } = gate;

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    decision?: "approved" | "rejected" | "apply" | "reject";
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

  const row = await decideApproval({
    id: body.id,
    decision,
    decidedBy: auth.sub,
  });
  if (!row) {
    return NextResponse.json({ error: "not_found_or_not_pending" }, { status: 404 });
  }

  let applyResult: { ok: boolean; reason?: string } | null = null;
  if (decision === "approved") {
    applyResult = await applyApprovedMoneyChange({
      approvalId: body.id,
      apply: async (proposed) => {
        // mode_switch: approve but do not change mode (discovery exit)
        if (row.kind === "mode_switch") return;
        const budget = await getBudget();
        const p =
          proposed && typeof proposed === "object"
            ? (proposed as Record<string, unknown>)
            : {};
        if (
          row.kind === "budget_increase" ||
          row.kind === "global_cap_increase" ||
          row.kind === "bid_increase"
        ) {
          await setConfigJson("budget", { ...budget, ...p }, auth.sub);
        }
      },
    });
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
