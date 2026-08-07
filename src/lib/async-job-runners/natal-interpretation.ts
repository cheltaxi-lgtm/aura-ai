import type { AsyncJobRow } from "@/lib/async-jobs";

import { runRouteHandlerInProcess } from "./route-adapter";
import type { ReportJobRunResult } from "./types";

export async function runNatalInterpretationJob(
  job: AsyncJobRow
): Promise<ReportJobRunResult> {
  const { POST } = await import("@/app/api/natal-chart/interpretation/route");
  return runRouteHandlerInProcess({
    job,
    pathname: "/api/natal-chart/interpretation",
    handler: POST,
  });
}
