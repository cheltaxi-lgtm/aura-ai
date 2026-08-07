import type { AsyncJobRow } from "@/lib/async-jobs";

import { runRouteHandlerInProcess } from "./route-adapter";
import type { ReportJobRunResult } from "./types";

export async function runProPremiumReportJob(
  job: AsyncJobRow
): Promise<ReportJobRunResult> {
  const { POST } = await import("@/app/(pro)/api/pro/jobs/premium-report/route");
  return runRouteHandlerInProcess({
    job,
    pathname: "/api/pro/jobs/premium-report",
    handler: POST,
  });
}
