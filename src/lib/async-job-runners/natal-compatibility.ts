import type { AsyncJobRow } from "@/lib/async-jobs";

import { runRouteHandlerInProcess } from "./route-adapter";
import type { ReportJobRunResult } from "./types";

export async function runNatalCompatibilityJob(
  job: AsyncJobRow
): Promise<ReportJobRunResult> {
  const id = job.input.id;
  if (typeof id !== "string" || !id.trim()) {
    return {
      ok: false,
      message: "Compatibility report id is required",
      code: "bad_payload",
    };
  }
  const { POST } = await import("@/app/api/natal-chart/compatibility/[id]/generate/route");
  return runRouteHandlerInProcess({
    job,
    pathname: `/api/natal-chart/compatibility/${encodeURIComponent(id)}/generate`,
    handler: (request) => POST(request, { params: Promise.resolve({ id }) }),
  });
}
