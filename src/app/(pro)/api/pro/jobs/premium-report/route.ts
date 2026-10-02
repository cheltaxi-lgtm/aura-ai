import { NextRequest, NextResponse } from "next/server";
import {
  getAsyncJobWorkerUserId,
  getReportWorkerJobFromRequest,
  getAsyncJobIdFromRequest,
} from "@/lib/async-job-worker-auth";
import {
  beginWorkerJobSave,
  makeWorkerProgressReporter,
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
} from "@/lib/async-job-lifecycle";
import { requireProEnabled } from "@/modules/pro/gate";
import { isProAiEnabled } from "@/modules/pro/config";
import {
  addVersion,
  getCase,
  getCaseInput,
  setCaseInput,
  updateCaseStatus,
} from "@/modules/pro/db/cases";
import { getClient } from "@/modules/pro/db/clients";
import { generateProPremiumReport } from "@/modules/pro/ai/generate-premium";
import { estimateProReportCostRub } from "@/modules/pro/ai/cost";
import { assertProHdGenerationCurrent, bindProHdCharge, claimProHdGeneration, failProHdCase, recoverProHdGeneration, saveProHdGeneration, type ProHdSource } from "@/modules/pro/db/hd-generation";
import { refineProHdReport } from "@/modules/pro/ai/hd-refine";
import type { ProReportBlock } from "@/modules/pro/domain/types";
import type { ProChartSnapshot } from "@/modules/pro/ai/generate-premium";
import { failAsyncJobAndRefundIfCharged } from "@/lib/async-jobs";
import { billingAdapter } from "@/modules/pro/adapters";

/** Sectional HD Pro reports need the same ceiling as consumer hd_report. */
export const maxDuration = 800;

export async function POST(request: NextRequest) {
  const gated = requireProEnabled();
  if (gated) return gated;

  const workerUserId = getAsyncJobWorkerUserId(request);
  if (!workerUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    accountId?: string | number;
    caseId?: string | number;
    chargeIdempotencyKey?: string;
    chargeTransactionId?: string | null;
    chargeRunes?: number;
    chargeShadow?: boolean;
    caseType?: string;
    frozenPayload?: Record<string,unknown>;
    frozenQuestion?: string|null;
    frozenClientId?: string|number;
    frozenAlias?: string;
    refinement?:{versionId:string;blockIndex:number;instruction:string;blocks:ProReportBlock[];snapshot:ProChartSnapshot};
  };

  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({error:"bad_payload"},{status:400});
  const accountId = body.accountId;
  const caseId = body.caseId;
  if (accountId == null || caseId == null) {
    await trackWorkerJobFailed(request, "accountId/caseId required");
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  if(body.caseType === "hd") {
    const worker=getReportWorkerJobFromRequest(request);
    if(!worker)return NextResponse.json({error:"invalid_worker_attempt"},{status:403});
    const binding={userId:workerUserId,accountId,caseId,worker,transactionId:body.chargeTransactionId??null};
    const saved=await recoverProHdGeneration(binding);
    if(saved)return NextResponse.json({ok:true,...saved});
    await bindProHdCharge(binding);
  }
  const failBeforeGeneration=async(message:string)=>{
    const worker=getReportWorkerJobFromRequest(request);
    if(body.caseType==="hd"&&worker){
      const settlement=await failAsyncJobAndRefundIfCharged(worker.jobId,message,"generation_failed",worker.attempt);
      if(settlement.failed)await failProHdCase(accountId,caseId,worker.jobId);
    }else await trackWorkerJobFailed(request,message);
  };
  if (!isProAiEnabled()) {
    await failBeforeGeneration("PRO_AI_ENABLED is off");
    return NextResponse.json({ error: "pro_ai_disabled" }, { status: 503 });
  }

  const c = await getCase(accountId, caseId);
  if (!c) {
    await failBeforeGeneration("case_not_found");
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }

  const input = await getCaseInput(caseId);
  const client = await getClient(accountId, c.client_id);
  const payload = { ...(input?.payload || {}) };

  if(c.type === "hd") {
    const worker=getReportWorkerJobFromRequest(request);
    if(!worker)return NextResponse.json({error:"invalid_worker_attempt"},{status:403});
    const source:ProHdSource={userId:workerUserId,accountId,caseId,payload:body.frozenPayload??payload,question:body.frozenQuestion===undefined?c.question:body.frozenQuestion,clientId:body.frozenClientId??c.client_id,alias:body.frozenAlias??client?.alias??"",worker,transactionId:body.chargeTransactionId??null};
    source.expectedVersionId=body.refinement?.versionId;
    try {
      await bindProHdCharge(source);
      const saved=await recoverProHdGeneration(source);
      if(saved)return NextResponse.json({ok:true,...saved});
      source.claimToken=await claimProHdGeneration(source);
      await assertProHdGenerationCurrent(source);
      const generated=body.refinement
        ? await refineProHdReport({...body.refinement,clientAlias:source.alias,question:source.question,deadlineAt:Date.now()+95_000,beforeRequest:()=>assertProHdGenerationCurrent(source)})
        : await generateProPremiumReport({type:"hd",payload:source.payload,clientAlias:source.alias,question:source.question,onProgress:makeWorkerProgressReporter(request),deadlineAt:Date.now()+720_000,beforeRequest:()=>assertProHdGenerationCurrent(source)});
      const result=await saveProHdGeneration(source,generated,typeof body.chargeRunes === "number" ? body.chargeRunes : 0);
      if(!result)return NextResponse.json({error:"stale_async_job_attempt"},{status:409});
      return NextResponse.json({ok:true,...result});
    } catch(error) {
      if(error instanceof Error&&error.message==="CLAIM_BUSY")return NextResponse.json({error:"Генерация уже выполняется.",code:"CLAIM_BUSY"},{status:409});
      const recovered=await recoverProHdGeneration(source).catch(()=>null);
      if(recovered)return NextResponse.json({ok:true,...recovered});
      const msg=error instanceof Error?error.message:"generation_failed";
      const settlement=await failAsyncJobAndRefundIfCharged(worker.jobId,msg,"generation_failed",worker.attempt);
      if(settlement.failed)await failProHdCase(accountId,caseId,worker.jobId);
      return NextResponse.json({error:msg},{status:(error as {status?:number}).status??502});
    }
  }

  try {
    const generated = await generateProPremiumReport({
      type: c.type,
      payload,
      clientAlias: client?.alias || "клиент",
      question: c.question,
      onProgress: makeWorkerProgressReporter(request),
    });

    if (!(await beginWorkerJobSave(request))) {
      await updateCaseStatus(accountId, caseId, "failed");
      return NextResponse.json({ error: "job_cancelled" }, { status: 409 });
    }

    const nextPayload = {
      ...payload,
      chartSnapshot: generated.snapshot,
      premiumJobId: getAsyncJobIdFromRequest(request),
    };
    await setCaseInput(accountId, caseId, nextPayload);

    const version = await addVersion(accountId, caseId, {
      source: "ai",
      blocks: generated.blocks,
      uncertaintyMarks: generated.uncertaintyMarks,
      authorUserId: null,
      status: "draft",
      aiCostRunes: typeof body.chargeRunes === "number" ? body.chargeRunes : 0,
      aiCostRub: await estimateProReportCostRub(generated.blocks).catch(() => null),
    });

    await trackWorkerJobCompleted(request, {
      caseId: String(caseId),
      versionId: version.id,
      blockCount: generated.blocks.length,
      caseType: c.type,
    });

    return NextResponse.json({
      ok: true,
      caseId,
      versionId: version.id,
      blockCount: generated.blocks.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "generate_failed";
    await updateCaseStatus(accountId, caseId, "failed");
    // Refund Pro charge if we have idempotency from enqueue
    if (
      body.chargeIdempotencyKey &&
      body.chargeTransactionId &&
      typeof body.chargeRunes === "number"
    ) {
      try {
        await billingAdapter.refund({
          userId: workerUserId,
          idempotencyKey: body.chargeIdempotencyKey,
          transactionId: body.chargeTransactionId,
          spentRunes: body.chargeRunes,
          shadow: Boolean(body.chargeShadow),
        });
      } catch {
        /* ignore refund errors */
      }
    }
    await trackWorkerJobFailed(request, msg);
    const status = (e as { status?: number }).status || 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
