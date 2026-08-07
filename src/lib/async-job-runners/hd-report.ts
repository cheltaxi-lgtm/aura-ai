import type { AsyncJobRow } from "@/lib/async-jobs";

import { runRouteHandlerInProcess } from "./route-adapter";
import type { ReportJobRunResult } from "./types";

export async function runHdReportJob(job: AsyncJobRow): Promise<ReportJobRunResult> {
  const { POST } = await import("@/app/api/human-design/report/route");
  return runRouteHandlerInProcess({
    job,
    pathname: "/api/human-design/report",
    handler: POST,
  });
}
