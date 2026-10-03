import type { NextRequest } from "next/server";
import { getAsyncJobIdFromRequest, getReportWorkerJobFromRequest } from "@/lib/async-job-worker-auth";
import { queryClient, withTransaction } from "@/lib/db";
import { buildJointReadingUrl, createJointReadingInvite } from "@/lib/joint-reading-service";
import { captureJointInviteMemory } from "@/lib/memory/capture-helpers";
import { captureMemoryGeneration } from "@/lib/memory/write-guard";
import { completeReportWorkerSave, lockReportWorkerSave, paidReportCanSave } from "./durable-report-receipt";

/** The invitation is the purchased artifact; timeout/refund cannot split its
 * insertion from the current worker's completed delivery. */
export async function createJointReadingInviteReceipt(input: {
  request: NextRequest;
  params: Parameters<typeof createJointReadingInvite>[0];
  transactionId?: string | null;
}): Promise<Record<string, unknown>> {
  const owner = input.params.initiatorUserId;
  const worker = getReportWorkerJobFromRequest(input.request);
  if (getAsyncJobIdFromRequest(input.request) && !worker || input.request.signal.aborted) throw new Error("stale_async_job_attempt");
  const captureGeneration = await captureMemoryGeneration(owner);
  const saved = await withTransaction(async client => {
    if (!(await lockReportWorkerSave(client,owner,worker,input.transactionId ?? undefined))) throw new Error("stale_async_job_attempt");
    if (!(await paidReportCanSave(client,input.transactionId))) throw new Error("joint_receipt_refunded");
    if (input.transactionId) {
      const held = (await queryClient(client,"SELECT id FROM rune_transactions WHERE id=$1 AND user_id=$2 AND type='spend' AND amount<0 AND action_type='JOINT_READING'",[input.transactionId,owner])).rows[0];
      if (!held || input.params.id !== input.transactionId) throw new Error("joint_receipt_owner_conflict");
    }
    const invite = await createJointReadingInvite({...input.params,reuseExisting:false},client);
    const payload = { token:invite.token,url:buildJointReadingUrl(invite.token),intentSlug:invite.intent_slug,
      spreadId:invite.spread_id,expiresAt:invite.expires_at,reused:false,configUpdated:false };
    await completeReportWorkerSave(client,owner,worker,payload);
    return { invite,payload };
  });
  await captureJointInviteMemory({captureGeneration,userId:owner,jointId:saved.invite.id,
    initiatorName:saved.invite.initiator_name,partnerName:saved.invite.partner_name,intentSlug:saved.invite.intent_slug})
    .catch(error=>console.warn("Joint invite committed; secondary memory capture failed:",error));
  return saved.payload;
}
