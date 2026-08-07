import { NextRequest } from "next/server";

import type { AsyncJobRow } from "@/lib/async-jobs";
import {
  WORKER_JOB_HEADER,
  WORKER_SECRET_HEADER,
  WORKER_USER_HEADER,
} from "@/lib/async-job-worker-auth";

import type { ReportJobRunResult } from "./types";

type InProcessRouteHandler = (
  request: NextRequest
) => Promise<Response>;

function responseMessage(body: Record<string, unknown>): string {
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  if (typeof body.error === "string" && body.error.trim()) return body.error;
  return "Report generation failed";
}

/**
 * Calls an existing route handler as a plain function. No socket or HTTP POST is
 * made: the handler and all LLM work execute inside aura-ai-async-jobs.
 *
 * This adapter is deliberately temporary-friendly: orchestration stays in one
 * place while route code is gradually extracted into request-free services.
 */
export async function runRouteHandlerInProcess(input: {
  job: AsyncJobRow;
  pathname: string;
  body?: Record<string, unknown>;
  handler: InProcessRouteHandler;
}): Promise<ReportJobRunResult> {
  const secret = process.env.ASYNC_JOB_WORKER_SECRET?.trim();
  if (!secret) {
    return {
      ok: false,
      message: "ASYNC_JOB_WORKER_SECRET is not configured",
      code: "worker_not_configured",
    };
  }

  const request = new NextRequest(`http://127.0.0.1${input.pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "127.0.0.1",
      [WORKER_SECRET_HEADER]: secret,
      [WORKER_USER_HEADER]: input.job.user_id,
      [WORKER_JOB_HEADER]: input.job.id,
    },
    body: JSON.stringify({ ...input.job.input, ...input.body, async: false }),
  });
  const response = await input.handler(request);
  const parsed = (await response.json().catch(() => ({}))) as unknown;
  const body =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};

  if (response.ok) return { ok: true, result: body };

  const code = typeof body.code === "string"
    ? body.code
    : typeof body.error === "string"
      ? body.error
      : undefined;
  const retryAfterSeconds = Number(response.headers.get("retry-after"));
  return {
    ok: false,
    message: responseMessage(body),
    code,
    needsRegeneration: code === "needs_regeneration",
    retryAfterMs:
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : undefined,
  };
}
