import type { AsyncJobRow } from "@/lib/async-jobs";

import { runRouteHandlerInProcess } from "./route-adapter";
import type { ReportJobRunResult } from "./types";

/**
 * Reuses /api/reading worker path in-process (no HTTP to Next).
 * Does not edit guest/entitlement branches — route handler owns those gates.
 */
export async function runNumerologyReadingJob(
  job: AsyncJobRow
): Promise<ReportJobRunResult> {
  const { POST } = await import("@/app/api/reading/route");
  return runRouteHandlerInProcess({
    job,
    pathname: "/api/reading",
    body: { characterId: "numerolog" },
    handler: POST,
  });
}
