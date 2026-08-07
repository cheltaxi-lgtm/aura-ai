import type { AsyncJobRow } from "@/lib/async-jobs";

import { runRouteHandlerInProcess } from "./route-adapter";
import type { ReportJobRunResult } from "./types";

export async function runNatalForecastJob(
  job: AsyncJobRow
): Promise<ReportJobRunResult> {
  const { POST } = await import("@/app/api/natal-chart/forecast/route");
  return runRouteHandlerInProcess({
    job,
    pathname: "/api/natal-chart/forecast",
    handler: POST,
  });
}
