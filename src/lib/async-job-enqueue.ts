import { NextResponse } from "next/server";

import {
  countActiveAsyncJobsForUser,
  createAsyncJob,
  findActiveAsyncJob,
  type AsyncJobKind,
} from "@/lib/async-jobs";
import { getJobKindConfig } from "@/lib/async-job-registry";
import { isAsyncJobWorkerConfigured } from "@/lib/async-job-worker-auth";
import { isReportBackgroundDeliveryEnabled } from "@/lib/async-report-flags";
import { resolveAsyncReportDestination } from "@/lib/async-report-destination";
import { ensureDb } from "@/lib/db";
import { isAiDeliveryKindEnabled } from "@/lib/settings";

/**
 * Extra fields for heavy report kinds when the background-delivery kill-switch
 * is on: the client shows "Отчёт принят" and lets the user leave instead of
 * blocking on the wait screen. Absent otherwise — old clients unaffected.
 */
function acceptedReportExtras(
  kind: AsyncJobKind,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (!isReportBackgroundDeliveryEnabled()) return {};
  const config = getJobKindConfig(kind);
  if (config.waitPolicy !== "background_notified") return {};
  const destination = resolveAsyncReportDestination({ kind, jobInput: payload });
  return {
    async: true,
    kind,
    waitPolicy: "background_notified",
    etaRangeSec: config.etaRangeSec ?? null,
    productTitle: config.productTitle ?? "Отчёт",
    destination,
  };
}

export async function enqueuePaidAsyncJob(input: {
  userId: string;
  kind: AsyncJobKind;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  actionType?: string;
  /** When true, skip aiDelivery.enabledKinds gate (natal keeps working). */
  bypassDeliveryGate?: boolean;
}): Promise<NextResponse> {
  if (!isAsyncJobWorkerConfigured()) {
    return NextResponse.json(
      { error: "Async job worker is not configured" },
      { status: 503 }
    );
  }
  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }

  const config = getJobKindConfig(input.kind);
  const natalKinds = new Set([
    "natal_interpretation",
    "natal_forecast",
    "natal_compatibility",
  ]);
  const bypass = input.bypassDeliveryGate || natalKinds.has(input.kind);
  if (!bypass && !(await isAiDeliveryKindEnabled(input.kind, input.userId))) {
    return NextResponse.json(
      { error: "Durable AI delivery is not enabled for this product yet", code: "ai_delivery_disabled" },
      { status: 503 }
    );
  }

  const dedupeKey =
    input.dedupeKey ?? config.buildDedupeKey(input.userId, input.payload);

  const existingId = await findActiveAsyncJob({
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
    dedupeKey,
  });
  if (existingId) {
    return NextResponse.json(
      {
        jobId: existingId,
        status: "pending",
        pollUrl: `/api/jobs/${existingId}`,
        deduped: true,
        ...acceptedReportExtras(input.kind, input.payload),
      },
      { status: 202 }
    );
  }

  const activeCount = await countActiveAsyncJobsForUser({
    userId: input.userId,
    kinds: [input.kind],
  });
  if (activeCount >= config.maxActivePerUser) {
    return NextResponse.json(
      {
        error: "Слишком много незавершённых генераций. Дождитесь завершения текущих.",
        code: "async_job_limit",
      },
      { status: 429 }
    );
  }

  const jobId = await createAsyncJob({
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
    dedupeKey,
    actionType: input.actionType ?? config.runeAction,
  });
  return NextResponse.json(
    {
      jobId,
      status: "pending",
      pollUrl: `/api/jobs/${jobId}`,
      ...acceptedReportExtras(input.kind, input.payload),
    },
    { status: 202 }
  );
}

/** Natal-compatible wrapper used by existing natal routes. */
export async function enqueueNatalAsyncJob(input: {
  userId: string;
  kind: Extract<
    AsyncJobKind,
    "natal_interpretation" | "natal_forecast" | "natal_compatibility"
  >;
  payload: Record<string, unknown>;
}): Promise<NextResponse> {
  return enqueuePaidAsyncJob({
    ...input,
    bypassDeliveryGate: true,
  });
}

/**
 * Fire-and-forget durable enqueue used from service layers (returns jobId).
 * Dedupes active jobs for the same kind/dedupe key.
 */
export async function schedulePaidAsyncJob(input: {
  userId: string;
  kind: AsyncJobKind;
  payload: Record<string, unknown>;
  bypassDeliveryGate?: boolean;
}): Promise<string | null> {
  if (!isAsyncJobWorkerConfigured()) return null;
  if (!(await ensureDb())) return null;

  const config = getJobKindConfig(input.kind);
  const natalKinds = new Set([
    "natal_interpretation",
    "natal_forecast",
    "natal_compatibility",
  ]);
  const bypass = input.bypassDeliveryGate || natalKinds.has(input.kind);
  if (!bypass && !(await isAiDeliveryKindEnabled(input.kind, input.userId))) {
    return null;
  }

  const dedupeKey = config.buildDedupeKey(input.userId, input.payload);
  const existingId = await findActiveAsyncJob({
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
    dedupeKey,
  });
  if (existingId) return existingId;

  const activeCount = await countActiveAsyncJobsForUser({
    userId: input.userId,
    kinds: [input.kind],
  });
  if (activeCount >= config.maxActivePerUser) return null;

  return createAsyncJob({
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
    dedupeKey,
    actionType: config.runeAction,
  });
}
