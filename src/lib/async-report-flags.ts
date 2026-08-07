import type { AsyncJobKind } from "@/lib/async-jobs";

/** Kill-switch: default OFF. Enable with 1/true/on/yes. */
export function isAsyncReportInProcessEnabled(): boolean {
  const v = process.env.ASYNC_REPORT_INPROCESS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** Kinds that move LLM generation into the worker when the kill-switch is on. */
export const REPORT_JOB_KINDS = [
  "hd_report",
  "hd_composite_report",
  "pro_premium_report",
  "numerology_reading",
  "natal_interpretation",
  "natal_forecast",
  "natal_compatibility",
] as const;

export type ReportJobKind = (typeof REPORT_JOB_KINDS)[number];

export function isReportJobKind(kind: string): kind is ReportJobKind {
  return (REPORT_JOB_KINDS as readonly string[]).includes(kind);
}

export function reportKindsAsAsyncJobKinds(): AsyncJobKind[] {
  return [...REPORT_JOB_KINDS];
}
