import { NextRequest, NextResponse } from "next/server";
import { getAsyncJobWorkerUserId, getReportWorkerJobFromRequest } from "@/lib/async-job-worker-auth";
import { makeWorkerProgressReporter } from "@/lib/async-job-lifecycle";
import { requireProEnabled } from "@/modules/pro/gate";
import { isProAiEnabled } from "@/modules/pro/config";
import { generateProPremiumReport, type ProChartSnapshot } from "@/modules/pro/ai/generate-premium";
import { generateCaseDraft } from "@/modules/pro/ai/draft";
import { refineProReportBlock } from "@/modules/pro/ai/refine-block";
import { assertProHdGenerationCurrent, bindProHdCharge, claimProHdGeneration, failProHdCase, recoverProHdGeneration, saveProHdGeneration, type ProHdSource } from "@/modules/pro/db/hd-generation";
import { refineProHdReport } from "@/modules/pro/ai/hd-refine";
import type { ProCaseType, ProReportBlock } from "@/modules/pro/domain/types";
import { failAsyncJobAndRefundIfCharged } from "@/lib/async-jobs";

export const maxDuration = 800;

export async function POST(request: NextRequest) {
  const gated = requireProEnabled();
  if (gated) return gated;
  const userId = getAsyncJobWorkerUserId(request);
  const worker = getReportWorkerJobFromRequest(request);
  if (!userId || !worker) return NextResponse.json({error:"Unauthorized"},{status:401});
  const body = await request.json().catch(()=>null) as {
    accountId:string|number;caseId:string|number;caseType:ProCaseType;
    chargeTransactionId?:string|null;chargeRunes?:number;
    frozenPayload?:Record<string,unknown>;frozenQuestion?:string|null;
    frozenClientId?:string|number;frozenAlias?:string;frozenPractitionerContext?:string|null;
    refinement?:{versionId:string;blockIndex:number;instruction:string;blocks:ProReportBlock[];snapshot:ProChartSnapshot|null};
  }|null;
  if(!body||typeof body!=="object"||Array.isArray(body)||body.accountId==null||body.caseId==null||!["hd","natal","matrix","manual_spread"].includes(body.caseType))return NextResponse.json({error:"bad_payload"},{status:400});
  const {accountId,caseId}=body;
  const source:ProHdSource={userId,accountId,caseId,caseType:body.caseType,payload:body.frozenPayload??{},question:body.frozenQuestion??null,clientId:body.frozenClientId??"",alias:body.frozenAlias??"",practitionerContext:body.frozenPractitionerContext??null,worker,transactionId:body.chargeTransactionId??null,expectedVersionId:body.refinement?.versionId};
  try {
    // Recovery precedes source validation: deleted or retired reports remain delivered purchases.
    const saved=await recoverProHdGeneration(source);
    if(saved)return NextResponse.json({ok:true,...saved});
    await bindProHdCharge(source);
    if(!isProAiEnabled())throw Object.assign(new Error("pro_ai_disabled"),{status:503});
    if(!body.frozenPayload||body.frozenClientId==null||typeof body.frozenAlias!=="string")throw Object.assign(new Error("generation_source_missing"),{status:409});
    source.claimToken=await claimProHdGeneration(source);
    const beforeRequest=()=>assertProHdGenerationCurrent(source);
    await beforeRequest();
    const deadlineAt=Date.now()+(body.refinement?95_000:720_000);
    let generated:Parameters<typeof saveProHdGeneration>[1];
    if(body.refinement&&body.caseType==="hd") {
      if(!body.refinement.snapshot)throw new Error("hd_regenerate_first");
      generated=await refineProHdReport({...body.refinement,snapshot:body.refinement.snapshot,clientAlias:source.alias,question:source.question,deadlineAt,beforeRequest});
    } else if(body.refinement) {
      const block=body.refinement.blocks[body.refinement.blockIndex];
      if(!block)throw new Error("block_not_found");
      const refined=await refineProReportBlock({block,instruction:body.refinement.instruction,clientAlias:source.alias,question:source.question,deadlineAt,beforeRequest});
      if(!refined)throw new Error("refine_failed");
      generated={blocks:body.refinement.blocks.map((b,i)=>i===body.refinement!.blockIndex?refined:b),snapshot:body.refinement.snapshot,uncertaintyMarks:[]};
    } else if(body.caseType==="manual_spread") {
      const draft=await generateCaseDraft({accountId,caseId,type:body.caseType,payload:source.payload,question:source.question,clientAlias:source.alias,practitionerContext:source.practitionerContext??null,deadlineAt,beforeRequest});
      if(draft.stub||draft.outcome==="failed")throw new Error("generation_failed");
      generated={blocks:draft.blocks,uncertaintyMarks:draft.uncertaintyMarks};
    } else {
      generated=await generateProPremiumReport({type:body.caseType,payload:source.payload,clientAlias:source.alias,question:source.question,onProgress:makeWorkerProgressReporter(request),deadlineAt,beforeRequest});
    }
    const result=await saveProHdGeneration(source,generated,typeof body.chargeRunes==="number"?body.chargeRunes:0);
    if(!result)return NextResponse.json({error:"stale_async_job_attempt"},{status:409});
    return NextResponse.json({ok:true,...result});
  } catch(error) {
    if(error instanceof Error&&error.message==="CLAIM_BUSY")return NextResponse.json({error:"Генерация уже выполняется.",code:"CLAIM_BUSY"},{status:409});
    const recovered=await recoverProHdGeneration(source).catch(()=>null);
    if(recovered)return NextResponse.json({ok:true,...recovered});
    const message=error instanceof Error?error.message:"generation_failed";
    const settlement=await failAsyncJobAndRefundIfCharged(worker.jobId,message,"generation_failed",worker.attempt);
    if(settlement.failed)await failProHdCase(accountId,caseId,worker.jobId);
    return NextResponse.json({error:message},{status:(error as {status?:number}).status??502});
  }
}
