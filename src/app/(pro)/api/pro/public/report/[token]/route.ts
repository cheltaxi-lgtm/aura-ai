import { NextResponse } from "next/server";
import { requireProEnabled } from "@/modules/pro/gate";
import {
  resolveDeliveryByRawToken,
  touchDeliveryView,
} from "@/modules/pro/db/deliveries";
import { getCase, listVersions } from "@/modules/pro/db/cases";
import { getAccountById } from "@/modules/pro/db/accounts";
import { proQuery } from "@/modules/pro/db";
import { clientAskOnDelivery } from "@/modules/pro/db/threads";
import { PRO_PUBLIC_DISCLAIMER } from "@/modules/pro/safety";
import { isProDeliveryEnabled } from "@/modules/pro/config";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const gated = requireProEnabled();
  if (gated) return gated;
  if (!isProDeliveryEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { token } = await ctx.params;
  const resolved = await resolveDeliveryByRawToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { firstOpen } = await touchDeliveryView(resolved.delivery.id);
  const c = await getCase(resolved.accountId, resolved.caseId);
  const versions = await listVersions(resolved.caseId);
  const human = [...versions].reverse().find((v) => v.source === "human");
  const account = await getAccountById(resolved.accountId);
  const { rows: brand } = await proQuery<{
    signature: string | null;
    extra_disclaimer: string | null;
  }>(`SELECT signature, extra_disclaimer FROM pro.brand WHERE account_id = $1`, [
    resolved.accountId,
  ]);

  if (firstOpen) {
    await proQuery(
      `INSERT INTO pro.audit_log (account_id, actor, action, target, meta)
       VALUES ($1, 'system', 'delivery.first_open', $2, '{}'::jsonb)`,
      [resolved.accountId, String(resolved.delivery.id)]
    );
  }

  return NextResponse.json({
    ok: true,
    report: {
      brandName: account?.display_name || "Практик",
      signature: brand[0]?.signature || null,
      question: c?.question || null,
      blocks: human?.blocks || [],
      disclaimer: brand[0]?.extra_disclaimer || PRO_PUBLIC_DISCLAIMER,
      dialogMode: resolved.delivery.dialog_mode,
      dialogQuota: resolved.delivery.dialog_quota,
      viewCount: resolved.delivery.view_count + 1,
    },
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const gated = requireProEnabled();
  if (gated) return gated;
  if (!isProDeliveryEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { token } = await ctx.params;
  const resolved = await resolveDeliveryByRawToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as { question?: string };
  if (!body.question?.trim()) {
    return NextResponse.json({ error: "question_required" }, { status: 400 });
  }
  const account = await getAccountById(resolved.accountId);
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const result = await clientAskOnDelivery({
    deliveryId: resolved.delivery.id,
    accountId: resolved.accountId,
    caseId: resolved.caseId,
    clientId: resolved.clientId,
    userIdForBilling: account.user_id,
    question: body.question.trim(),
    dialogMode: resolved.delivery.dialog_mode,
    dialogQuota: resolved.delivery.dialog_quota,
  });
  return NextResponse.json({ ok: true, ...result });
}
