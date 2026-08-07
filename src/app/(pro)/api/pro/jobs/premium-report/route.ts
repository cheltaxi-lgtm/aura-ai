import { NextRequest, NextResponse } from "next/server";
import {
  getAsyncJobWorkerUserId,
  getAsyncJobIdFromRequest,
} from "@/lib/async-job-worker-auth";
import {
  beginWorkerJobSave,
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
import { billingAdapter } from "@/modules/pro/adapters";

export const maxDuration = 600;

export async function POST(request: NextRequest) {
  const gated = requireProEnabled();
  if (gated) return gated;

  const workerUserId = getAsyncJobWorkerUserId(request);
  if (!workerUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProAiEnabled()) {
    await trackWorkerJobFailed(request, "PRO_AI_ENABLED is off");
    return NextResponse.json({ error: "pro_ai_disabled" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    accountId?: string | number;
    caseId?: string | number;
    chargeIdempotencyKey?: string;
    chargeTransactionId?: string | null;
    chargeRunes?: number;
    chargeShadow?: boolean;
  };

  const accountId = body.accountId;
  const caseId = body.caseId;
  if (accountId == null || caseId == null) {
    await trackWorkerJobFailed(request, "accountId/caseId required");
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  const c = await getCase(accountId, caseId);
  if (!c) {
    await trackWorkerJobFailed(request, "case_not_found");
    return NextResponse.json({ error: "case_not_found" }, { status: 404 });
  }

  const input = await getCaseInput(caseId);
  const client = await getClient(accountId, c.client_id);
  const payload = { ...(input?.payload || {}) };

  try {
    const generated = await generateProPremiumReport({
      type: c.type,
      payload,
      clientAlias: client?.alias || "клиент",
      question: c.question,
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
