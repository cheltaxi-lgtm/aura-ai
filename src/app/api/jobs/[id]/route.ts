import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  asyncJobPollPayload,
  getAsyncJobForUser,
  getAsyncJobQueuePosition,
} from "@/lib/async-jobs";
import { isReportClaimPaused } from "@/lib/async-report-circuit-breaker";
import { resolveProfileUserContext, profileAuthFailureResponse } from "@/lib/require-auth";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const { id } = await context.params;
  const job = await getAsyncJobForUser(id, resolved.profileUserId);
  if (!job) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const payload = asyncJobPollPayload(job);
  const queuePosition =
    job.status === "pending" ? await getAsyncJobQueuePosition(job.id) : null;
  const providerPaused = isReportClaimPaused();
  return NextResponse.json({
    ...payload,
    queuePosition,
    providerPaused,
    clientMessage:
      providerPaused && (job.status === "pending" || job.status === "running")
        ? "Провайдер временно недоступен, задача в очереди. Повторного списания рун не будет."
        : job.status === "pending" && queuePosition
          ? `В очереди, позиция ${queuePosition}. Можно закрыть вкладку — ссылка постоянная.`
          : job.status === "running"
            ? "Генерация идёт. Можно закрыть вкладку и вернуться позже."
            : undefined,
  });
}
