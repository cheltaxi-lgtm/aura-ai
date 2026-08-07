import type { AsyncJobRow } from "@/lib/async-jobs";
import { isReportJobKind } from "@/lib/async-report-flags";

import { runHdCompositeReportJob } from "./hd-composite-report";
import { runHdReportJob } from "./hd-report";
import { runNatalCompatibilityJob } from "./natal-compatibility";
import { runNatalForecastJob } from "./natal-forecast";
import { runNatalInterpretationJob } from "./natal-interpretation";
import { runNumerologyReadingJob } from "./numerology-reading";
import { runProPremiumReportJob } from "./pro-premium-report";
import type { ReportJobRunResult } from "./types";

export type { ReportJobRunResult } from "./types";

export async function runReportJobInProcess(
  job: AsyncJobRow
): Promise<ReportJobRunResult> {
  if (!isReportJobKind(job.kind)) {
    return {
      ok: false,
      message: `Unsupported in-process report job kind: ${job.kind}`,
      code: "unsupported_report_job_kind",
    };
  }

  switch (job.kind) {
    case "hd_report":
      return runHdReportJob(job);
    case "hd_composite_report":
      return runHdCompositeReportJob(job);
    case "pro_premium_report":
      return runProPremiumReportJob(job);
    case "numerology_reading":
      return runNumerologyReadingJob(job);
    case "natal_interpretation":
      return runNatalInterpretationJob(job);
    case "natal_forecast":
      return runNatalForecastJob(job);
    case "natal_compatibility":
      return runNatalCompatibilityJob(job);
  }
}
