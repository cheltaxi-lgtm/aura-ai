import { NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import {
  addVersion,
  getCase,
  getCaseInput,
  hardDeleteCase,
  inferRestoreStatus,
  listVersions,
  setCaseInput,
  updateCaseStatus,
} from "@/modules/pro/db/cases";
import { getClient, updateClient } from "@/modules/pro/db/clients";
import { clientBirthPatchFromPayload } from "@/modules/pro/adapters/client-birth";
import { writeAudit } from "@/modules/pro/db/accounts";
import {
  hdAdapter,
  matrixAdapter,
  natalAdapter,
} from "@/modules/pro/adapters";
import {
  createDelivery,
  remintDelivery,
  revokeAllDeliveriesForCase,
  revokeDelivery,
} from "@/modules/pro/db/deliveries";
import { InsufficientFundsError, ProTrialExceededError } from "@/modules/pro/db/billing";
import { insufficientFundsResponse } from "@/lib/services/billing-service";
import type { ProCaseType, ProReportBlock } from "@/modules/pro/domain/types";
import { proQuery } from "@/modules/pro/db";
import { isProAiEnabled } from "@/modules/pro/config";
import { isAsyncJobWorkerConfigured } from "@/lib/async-job-worker-auth";
import { acceptedReportExtras } from "@/lib/async-job-enqueue";
import { enqueueProHdGeneration } from "@/modules/pro/db/hd-generation";

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
  const body = (await req.json().catch(() => null)) as Record<string, unknown>;
  if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"bad_payload"},{status:400});
  const action = String(body.action || "");

  if (action === "input") {
    const payload = (body.payload as Record<string, unknown>) || {};
    const c = await getCase(prac.ctx.account.id, id);
    if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if(c.status==="generating")return NextResponse.json({error:"generation_in_progress",message:"Дождитесь завершения отчёта, затем измените данные."},{status:409});
    const finalPayload = await prepareBirthPayload(c.type, payload);
    let updated;
    try { updated = await setCaseInput(prac.ctx.account.id, id, finalPayload); }
    catch(error) {
      if(error instanceof Error&&error.message==="generation_in_progress")return NextResponse.json({error:"generation_in_progress",message:"Дождитесь завершения отчёта, затем измените данные."},{status:409});
      throw error;
    }
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
    const revoked = await revokeAllDeliveriesForCase(
      prac.ctx.account.id,
      id,
      prac.ctx.profileUserId,
      "case.archive"
    );
    await writeAudit({
      accountId: prac.ctx.account.id,
      actor: "user",
      actorUserId: prac.ctx.profileUserId,
      action: "case.archive",
      target: String(id),
      meta: { revokedDeliveries: revoked },
    });
    return NextResponse.json({ ok: true, case: updated, revokedDeliveries: revoked });
  }

  if (action === "restore") {
    const c = await getCase(prac.ctx.account.id, id);
    if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (c.status !== "archived") {
      return NextResponse.json(
        { error: "not_archived", message: "Кейс не в архиве" },
        { status: 409 }
      );
    }
    const nextStatus = await inferRestoreStatus(id);
    const updated = await updateCaseStatus(prac.ctx.account.id, id, nextStatus);
    await writeAudit({
      accountId: prac.ctx.account.id,
      actor: "user",
      actorUserId: prac.ctx.profileUserId,
      action: "case.restore",
      target: String(id),
      meta: { status: nextStatus },
    });
    return NextResponse.json({
      ok: true,
      case: updated,
      message:
        "Кейс восстановлен. Старые ссылки клиента остаются отключёнными — выдайте заново при необходимости.",
    });
  }

  if (action === "purge") {
    const c = await getCase(prac.ctx.account.id, id);
    if (!c) {
      // A separate Pro DELETE may already have committed while main cleanup
      // rolled back. Retrying still settles this owner's matching job copies.
      await hardDeleteCase(prac.ctx.account.id,id);
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    await revokeAllDeliveriesForCase(
      prac.ctx.account.id,
      id,
      prac.ctx.profileUserId,
      "case.purge"
    );
    const ok = await hardDeleteCase(prac.ctx.account.id, id);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await writeAudit({
      accountId: prac.ctx.account.id,
      actor: "user",
      actorUserId: prac.ctx.profileUserId,
      action: "case.purge",
      target: String(id),
      meta: { clientId: c.client_id, type: c.type },
    });
    return NextResponse.json({ ok: true, purged: true });
  }

  if (action === "generate" || action === "refine_block") {
    const c = await getCase(prac.ctx.account.id, id);
    if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (c.status === "archived") return NextResponse.json({error:"case_archived"},{status:409});
    if (!isProAiEnabled() || !isAsyncJobWorkerConfigured()) return NextResponse.json({error:"generation_unavailable",message:"Генерация временно недоступна. Попробуйте позже."},{status:503});
    const input = await getCaseInput(id);
    const client = await getClient(prac.ctx.account.id, c.client_id);
    if (!client) return NextResponse.json({error:"client_not_found"},{status:404});
    let payload = { ...(input?.payload || {}) };
    let refinement:{versionId:string;blockIndex:number;instruction:string}|undefined;
    if(action==="generate"&&c.type==="manual_spread"&&(!Array.isArray(payload.cards)||!payload.cards.length||payload.cards.some(card=>typeof card==="string"?!card.trim():!card||typeof card!=="object"||typeof (card as {name?:unknown}).name!=="string"||!(card as {name:string}).name.trim())))return NextResponse.json({error:"cards_required",message:"Сохраните карты расклада"},{status:400});
    if(action === "refine_block") {
      const instruction=typeof body.instruction==="string"?body.instruction.trim().slice(0,500):"";
      const blockIndex=typeof body.blockIndex==="number"&&Number.isInteger(body.blockIndex)?body.blockIndex:-1;
      if(!instruction||blockIndex<0)return NextResponse.json({error:"refine_params_required",message:"Укажите секцию и инструкцию"},{status:400});
      const versions=await listVersions(id);
      const latest=typeof body.versionId==="string"?versions.find(version=>String(version.id)===body.versionId):versions.at(-1);
      if(!latest?.blocks[blockIndex])return NextResponse.json({error:"block_not_found",message:"Секция не найдена — обновите страницу"},{status:404});
      refinement={versionId:latest.id,blockIndex,instruction};
    } else if(c.type === "natal" || c.type === "matrix" || c.type === "hd") {
      // Compute from saved birth fields, never trust stale derived facts.
      payload=await prepareBirthPayload(c.type,payload);
      if (!(payload.chartFacts as {ok?:boolean}|undefined)?.ok) return NextResponse.json({error:"birth_data_required",message:"Сохраните данные рождения"},{status:400});
    }
    try {
      const queued=await enqueueProHdGeneration({userId:prac.ctx.profileUserId,accountId:prac.ctx.account.id,caseId:id,expectedPayload:input?.payload??{},payload,refinement,idempotencyKey:typeof body.idempotencyKey==="string"?body.idempotencyKey:undefined});
      return NextResponse.json({ok:true,async:true,status:"generating",jobId:queued.jobId,pollUrl:"/api/jobs/"+queued.jobId,charge:queued.charge,deduped:queued.deduped,...acceptedReportExtras("pro_premium_report",{caseId:id,caseType:c.type})},{status:202});
    } catch(error) {
      if(error instanceof InsufficientFundsError)return insufficientFundsResponse(error);
      const status=error instanceof ProTrialExceededError?402:(error as {status?:number}).status??500;
      return NextResponse.json({error:error instanceof Error?error.message:"generation_failed"},{status});
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
      // Human-gate: accepting an AI draft as the client-facing report is an
      // explicit, audited act — never a silent side effect of «Выдать ссылку».
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
        if (body.confirmReview !== true) {
          return NextResponse.json(
            {
              error: "pro_deliver_requires_review",
              requiresReview: true,
              message:
                "Подтвердите, что прочитали все секции отчёта, — только после этого ссылка будет выдана.",
            },
            { status: 409 }
          );
        }
        const accepted = await addVersion(prac.ctx.account.id, id, {
          source: "human",
          blocks: acceptBlocks,
          authorUserId: prac.ctx.profileUserId,
          status: "edited",
        });
        await writeAudit({
          accountId: prac.ctx.account.id,
          actor: "user",
          actorUserId: prac.ctx.profileUserId,
          action: "case.accept_ai_draft",
          target: String(id),
          meta: { versionId: accepted.id, version: accepted.version },
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
            : code === "case_archived"
              ? "Кейс в архиве — восстановите, затем выдайте ссылку заново."
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

  // Re-issue the client link: old tokens die, fresh token minted. Requires an
  // already-accepted human version (the case was deliverable before).
  if (action === "remint") {
    const ttl = (body.ttl as "7" | "30" | "90" | "forever") || "30";
    try {
      const { delivery, rawToken } = await remintDelivery(
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
          ? "Сначала примите отчёт — без принятого текста ссылку перевыпустить нельзя."
          : code === "delivery_disabled"
            ? "Выдача ссылок отключена (PRO_DELIVERY_ENABLED)."
            : code === "case_archived"
              ? "Кейс в архиве — восстановите, затем перевыпустите ссылку."
              : code;
      return NextResponse.json({ error: code, message }, { status });
    }
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}

/** Soft-delete = archive + revoke all mini-landing tokens. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const { id } = await ctx.params;
  const updated = await updateCaseStatus(prac.ctx.account.id, id, "archived");
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const revoked = await revokeAllDeliveriesForCase(
    prac.ctx.account.id,
    id,
    prac.ctx.profileUserId,
    "case.archive"
  );
  await writeAudit({
    accountId: prac.ctx.account.id,
    actor: "user",
    actorUserId: prac.ctx.profileUserId,
    action: "case.archive",
    target: String(id),
    meta: { revokedDeliveries: revoked },
  });
  return NextResponse.json({ ok: true, case: updated, revokedDeliveries: revoked });
}
