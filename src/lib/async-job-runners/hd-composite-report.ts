import type { AsyncJobRow } from "@/lib/async-jobs";

import { runRouteHandlerInProcess } from "./route-adapter";
import type { ReportJobRunResult } from "./types";

export async function runHdCompositeReportJob(
  job: AsyncJobRow
): Promise<ReportJobRunResult> {
  const { POST } = await import("@/app/api/human-design/composite-report/route");
  return runRouteHandlerInProcess({
    job,
    pathname: "/api/human-design/composite-report",
    handler: POST,
  });
}
