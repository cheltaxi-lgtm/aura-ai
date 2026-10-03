import type { NextRequest } from "next/server";
import { getAsyncJobIdFromRequest, getReportWorkerJobFromRequest } from "@/lib/async-job-worker-auth";
import { queryClient, withTransaction } from "@/lib/db";
import { createHistoryEntry } from "@/lib/users";
import { completeReportWorkerSave, lockReportWorkerSave, paidReportCanSave } from "./durable-report-receipt";

/** The artifact and worker delivery commit together under job → receipt → profile locks. */
export async function saveHistoryProductReceipt(input: {
  request: NextRequest;
  history: Parameters<typeof createHistoryEntry>[0];
  transactionId?: string | null;
  result: Record<string, unknown>;
}): Promise<{ id: string }> {
  const worker = getReportWorkerJobFromRequest(input.request);
  if (getAsyncJobIdFromRequest(input.request) && !worker) throw new Error("stale_async_job_attempt");
  if (input.request.signal.aborted) throw new Error("stale_async_job_attempt");
  return withTransaction(async client => {
    if (!(await lockReportWorkerSave(client, input.history.userId, worker, input.transactionId ?? undefined))) throw new Error("stale_async_job_attempt");
    if (!(await paidReportCanSave(client, input.transactionId))) throw new Error("paid_history_receipt_refunded");
    if (input.transactionId) {
      const spend = (await queryClient<{ action_type: string | null }>(client,
        "SELECT action_type FROM rune_transactions WHERE id=$1 AND user_id=$2 AND type='spend' AND amount<0",
        [input.transactionId, input.history.userId])).rows[0];
      const validAction = input.history.contextData.type === "reading" ? spend?.action_type === "READING"
        : input.history.contextData.type === "scene_image" && ["DESTINY_CARD", "FINAL_REPORT", "SCENE_ILLUSTRATION", "TAROT_ATMOSPHERE"].includes(spend?.action_type ?? "");
      if (!validAction) throw new Error("paid_history_receipt_owner_or_action_conflict");
    }
    const entry = await createHistoryEntry({ ...input.history, contextData: {
      ...input.history.contextData, transactionId: input.transactionId ?? null, receiptDelivery: input.result,
    } }, client);
    await completeReportWorkerSave(client, input.history.userId, worker, { ...input.result, historyId: entry.id });
    return entry;
  });
}
