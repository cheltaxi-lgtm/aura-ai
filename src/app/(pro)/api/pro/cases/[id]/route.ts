import { NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import {
  addVersion,
  getCase,
  getCaseInput,
  listVersions,
  setCaseInput,
  updateCaseStatus,
} from "@/modules/pro/db/cases";
import { getClient, updateClient } from "@/modules/pro/db/clients";
import { clientBirthPatchFromPayload } from "@/modules/pro/adapters/client-birth";
import { writeAudit } from "@/modules/pro/db/accounts";
import {
  aiAdapter,
  billingAdapter,
  hdAdapter,
  matrixAdapter,
  natalAdapter,
} from "@/modules/pro/adapters";
import { createDelivery, revokeDelivery } from "@/modules/pro/db/deliveries";
import { InsufficientFundsError } from "@/modules/pro/db/billing";
import { insufficientFundsResponse } from "@/lib/services/billing-service";
import type { ProCaseType, ProReportBlock } from "@/modules/pro/domain/types";
import { proQuery } from "@/modules/pro/db";
import { isProAiEnabled } from "@/modules/pro/config";
import { isAsyncJobWorkerConfigured } from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import { generateProPremiumReport } from "@/modules/pro/ai/generate-premium";

export const maxDuration = 600;

type Ctx = { params: Promise<{ id: string }> };

async function prepareBirthPayload(
  type: ProCaseType,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  let finalPayload = { ...payload };

  if (type === "natal") {
    finalPayload = await natalAdapter.enrichPlace({
      ...finalPayload,
      ...natalAdapter.summarizeInput(finalPayload),
    });
    const facts = await natalAdapter.computeFacts(finalPayload);
    finalPayload.chartFacts = facts;
    if (facts.ok) {
      finalPayload.evidenceText = facts.evidenceText;
    }
  }

  if (type === "matrix") {
    finalPayload = await natalAdapter.enrichPlace(finalPayload);
    const birthDate =
      typeof finalPayload.birthDate === "string" ? finalPayload.birthDate : null;
    if (birthDate) {
      const facts = matrixAdapter.computeFacts(birthDate);
      finalPayload.matrix = facts.matrix;
      finalPayload.chartFacts = facts;
      finalPayload.evidenceText = facts.evidenceText;
    }
  }

  if (type === "hd") {
    finalPayload = await hdAdapter.enrichPlace({
      ...finalPayload,
      ...hdAdapter.summarizeInput(finalPayload),
    });
    const facts = hdAdapter.computeFacts(finalPayload);
    finalPayload.chartFacts = facts;
    if (facts.ok) {
      finalPayload.evidenceText = facts.evidenceText;
    }
  }

  return finalPayload;
}

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
    const c = await getCase(prac.ctx.account.id, id);
    if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const finalPayload = await prepareBirthPayload(c.type, payload);
    const updated = await setCaseInput(prac.ctx.account.id, id, finalPayload);
    // Persist birth on client card so next case prefills.
    try {
      await updateClient(
        prac.ctx.account.id,
        c.client_id,
        clientBirthPatchFromPayload(finalPayload)
      );
    } catch {
      /* non-fatal */
    }
    return NextResponse.json({ ok: true, case: updated, payload: finalPayload });
  }

  if (action === "archive") {
    const updated = await updateCaseStatus(prac.ctx.account.id, id, "archived");
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await writeAudit({
      accountId: prac.ctx.account.id,
      actor: "user",
      actorUserId: prac.ctx.profileUserId,
      action: "case.archive",
      target: String(id),
    });
    return NextResponse.json({ ok: true, case: updated });
  }

  if (action === "generate") {
    const c = await getCase(prac.ctx.account.id, id);
    if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const input = await getCaseInput(id);
    const client = await getClient(prac.ctx.account.id, c.client_id);
    let payload = { ...(input?.payload || {}) };
    const isBirth = c.type === "natal" || c.type === "matrix" || c.type === "hd";

    if (isBirth) {
      const facts = payload.chartFacts as { ok?: boolean } | undefined;
      if (!facts?.ok) {
        payload = await prepareBirthPayload(c.type, payload);
        await setCaseInput(prac.ctx.account.id, id, payload);
      }
      if (!(payload.chartFacts as { ok?: boolean } | undefined)?.ok) {
        return NextResponse.json(
          { error: "birth_data_required", message: "Сохраните данные рождения" },
          { status: 400 }
        );
      }
    }

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

    // Birth practices + AI + worker → async consumer-quality generate
    if (isBirth && isProAiEnabled() && isAsyncJobWorkerConfigured()) {
      try {
        await updateCaseStatus(prac.ctx.account.id, id, "generating");
        const enqueued = await enqueuePaidAsyncJob({
          userId: prac.ctx.profileUserId,
          kind: "pro_premium_report",
          bypassDeliveryGate: true,
          dedupeKey: `pro-premium:${prac.ctx.account.id}:${id}:${idem}`,
          payload: {
            accountId: prac.ctx.account.id,
            caseId: id,
            caseType: c.type,
            idempotencyKey: idem,
            chargeIdempotencyKey: idem,
            chargeTransactionId: charge.ledgerTxnRef,
            chargeRunes: charge.runes,
            chargeShadow: charge.shadow,
          },
        });
        if (enqueued.status !== 202) {
          await billingAdapter.refund({
            userId: prac.ctx.profileUserId,
            idempotencyKey: idem,
            transactionId: charge.ledgerTxnRef,
            spentRunes: charge.runes,
            shadow: charge.shadow,
          });
          await updateCaseStatus(prac.ctx.account.id, id, "failed");
          return enqueued;
        }
        const json = await enqueued.json();
        await setCaseInput(prac.ctx.account.id, id, {
          ...payload,
          premiumJobId: json.jobId,
        });
        return NextResponse.json({
          ok: true,
          async: true,
          jobId: json.jobId,
          pollUrl: json.pollUrl || `/api/jobs/${json.jobId}`,
          charge,
          status: "generating",
        });
      } catch (e) {
        await billingAdapter.refund({
          userId: prac.ctx.profileUserId,
          idempotencyKey: idem,
          transactionId: charge.ledgerTxnRef,
          spentRunes: charge.runes,
          shadow: charge.shadow,
        });
        await updateCaseStatus(prac.ctx.account.id, id, "failed");
        throw e;
      }
    }

    // Sync path: stub / manual_spread / no worker
    try {
      if (isBirth && isProAiEnabled()) {
        const generated = await generateProPremiumReport({
          type: c.type,
          payload,
          clientAlias: client?.alias || "клиент",
          question: c.question,
        });
        await setCaseInput(prac.ctx.account.id, id, {
          ...payload,
          chartSnapshot: generated.snapshot,
        });
        const version = await addVersion(prac.ctx.account.id, id, {
          source: "ai",
          blocks: generated.blocks,
          uncertaintyMarks: generated.uncertaintyMarks,
          authorUserId: null,
          status: "draft",
          aiCostRunes: charge.runes,
        });
        return NextResponse.json({
          ok: true,
          version,
          charge,
          stub: false,
          outcome: "ok",
          async: false,
        });
      }

      const draft = await aiAdapter.generateDraft({
        accountId: prac.ctx.account.id,
        caseId: id,
        type: c.type,
        question: c.question,
        practitionerContext: c.practitioner_context,
        clientAlias: client?.alias || "клиент",
        payload,
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
        async: false,
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
      // Practitioner UX: «Выдать ссылку» accepts the current/latest AI draft
      // as human if needed (human-gate still enforced inside createDelivery).
      const versions = await listVersions(id);
      const hasHuman = versions.some((v) => v.source === "human");
      if (!hasHuman) {
        const bodyBlocks = body.blocks as ProReportBlock[] | undefined;
        const latestAi = [...versions].reverse().find((v) => v.source === "ai");
        const acceptBlocks =
          Array.isArray(bodyBlocks) && bodyBlocks.length
            ? bodyBlocks
            : latestAi?.blocks;
        if (!acceptBlocks?.length) {
          return NextResponse.json(
            {
              error: "pro_deliver_requires_report",
              message:
                "Сначала сгенерируйте и примите отчёт — без текста ссылку выдать нельзя.",
            },
            { status: 409 }
          );
        }
        await addVersion(prac.ctx.account.id, id, {
          source: "human",
          blocks: acceptBlocks,
          authorUserId: prac.ctx.profileUserId,
          status: "edited",
        });
      }

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
      const code = e instanceof Error ? e.message : "error";
      const message =
        code === "pro_deliver_requires_human_version"
          ? "Сначала нажмите «Принять отчёт», затем выдайте ссылку."
          : code === "delivery_disabled"
            ? "Выдача ссылок отключена (PRO_DELIVERY_ENABLED)."
            : code;
      return NextResponse.json({ error: code, message }, { status });
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

/** Soft-delete = archive (keeps audit / deliveries). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const { id } = await ctx.params;
  const updated = await updateCaseStatus(prac.ctx.account.id, id, "archived");
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await writeAudit({
    accountId: prac.ctx.account.id,
    actor: "user",
    actorUserId: prac.ctx.profileUserId,
    action: "case.archive",
    target: String(id),
  });
  return NextResponse.json({ ok: true, case: updated });
}
