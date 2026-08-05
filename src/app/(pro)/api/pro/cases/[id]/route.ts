import { NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import {
  addVersion,
  getCase,
  getCaseInput,
  listVersions,
  setCaseInput,
} from "@/modules/pro/db/cases";
import { getClient } from "@/modules/pro/db/clients";
import { aiAdapter, billingAdapter, matrixAdapter, natalAdapter } from "@/modules/pro/adapters";
import { createDelivery, revokeDelivery } from "@/modules/pro/db/deliveries";
import { InsufficientFundsError } from "@/modules/pro/db/billing";
import { insufficientFundsResponse } from "@/lib/services/billing-service";
import type { ProReportBlock } from "@/modules/pro/domain/types";
import { proQuery } from "@/modules/pro/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const { id } = await ctx.params;
  const c = await getCase(prac.ctx.account.id, id);
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [input, versions, client] = await Promise.all([
    getCaseInput(id),
    listVersions(id),
    getClient(prac.ctx.account.id, c.client_id),
  ]);
  const { rows: deliveries } = await proQuery(
    `SELECT id, token_prefix, ttl_expires_at, revoked_at, view_count, dialog_mode, created_at
     FROM pro.deliveries WHERE case_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  return NextResponse.json({
    ok: true,
    case: c,
    client,
    input,
    versions,
    deliveries,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "");

  if (action === "input") {
    const payload = (body.payload as Record<string, unknown>) || {};
    let finalPayload = { ...payload };
    const c = await getCase(prac.ctx.account.id, id);
    if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (c.type === "natal") {
      finalPayload = { ...finalPayload, ...natalAdapter.summarizeInput(payload) };
    }
    if (c.type === "matrix" && typeof payload.birthDate === "string") {
      finalPayload.matrix = matrixAdapter.compute(payload.birthDate);
    }
    const updated = await setCaseInput(prac.ctx.account.id, id, finalPayload);
    return NextResponse.json({ ok: true, case: updated, payload: finalPayload });
  }

  if (action === "generate") {
    const c = await getCase(prac.ctx.account.id, id);
    if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const input = await getCaseInput(id);
    const client = await getClient(prac.ctx.account.id, c.client_id);
    const idem =
      typeof body.idempotencyKey === "string" && body.idempotencyKey
        ? body.idempotencyKey
        : `pro-gen-${id}-${Date.now()}`;
    let charge;
    try {
      charge = await billingAdapter.charge({
        accountId: prac.ctx.account.id,
        userId: prac.ctx.profileUserId,
        action: "generate_draft",
        caseId: id,
        idempotencyKey: idem,
      });
    } catch (e) {
      if (e instanceof InsufficientFundsError) return insufficientFundsResponse(e);
      throw e;
    }
    try {
      const draft = await aiAdapter.generateDraft({
        accountId: prac.ctx.account.id,
        caseId: id,
        type: c.type,
        question: c.question,
        practitionerContext: c.practitioner_context,
        clientAlias: client?.alias || "клиент",
        payload: input?.payload || {},
      });
      const version = await addVersion(prac.ctx.account.id, id, {
        source: "ai",
        blocks: draft.blocks,
        uncertaintyMarks: draft.uncertaintyMarks,
        authorUserId: null,
        status: "draft",
        aiCostRunes: charge.runes,
      });
      return NextResponse.json({
        ok: true,
        version,
        charge,
        stub: draft.stub,
        outcome: draft.outcome,
      });
    } catch (e) {
      await billingAdapter.refund({
        userId: prac.ctx.profileUserId,
        idempotencyKey: idem,
        transactionId: charge.ledgerTxnRef,
        spentRunes: charge.runes,
        shadow: charge.shadow,
      });
      throw e;
    }
  }

  if (action === "save_human") {
    const blocks = body.blocks as ProReportBlock[];
    if (!Array.isArray(blocks) || !blocks.length) {
      return NextResponse.json({ error: "blocks_required" }, { status: 400 });
    }
    const version = await addVersion(prac.ctx.account.id, id, {
      source: "human",
      blocks,
      authorUserId: prac.ctx.profileUserId,
      status: "edited",
    });
    return NextResponse.json({ ok: true, version });
  }

  if (action === "deliver") {
    const ttl = (body.ttl as "7" | "30" | "90" | "forever") || "30";
    try {
      const { delivery, rawToken } = await createDelivery(
        prac.ctx.account.id,
        id,
        {
          ttl,
          dialogMode: (body.dialogMode as "a" | "b" | "c") || "b",
          dialogQuota: typeof body.dialogQuota === "number" ? body.dialogQuota : 5,
          actorUserId: prac.ctx.profileUserId,
        }
      );
      return NextResponse.json({
        ok: true,
        delivery,
        url: `/r/${rawToken}`,
        token: rawToken,
      });
    } catch (e) {
      const status = (e as { status?: number }).status || 500;
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "error" },
        { status }
      );
    }
  }

  if (action === "revoke_delivery") {
    const deliveryId = String(body.deliveryId || "");
    const ok = await revokeDelivery(
      prac.ctx.account.id,
      deliveryId,
      prac.ctx.profileUserId
    );
    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
