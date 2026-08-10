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

/**
 * Kill-switch: default OFF. Enable with REPORT_BACKGROUND_DELIVERY_ENABLED=1.
 * When on, heavy report kinds advertise waitPolicy "background_notified" and the
 * client shows the "Отчёт принят" screen instead of blocking wait.
 */
export function isReportBackgroundDeliveryEnabled(): boolean {
  const v = process.env.REPORT_BACKGROUND_DELIVERY_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** Kill-switch: default OFF. Telegram report-ready notifications. */
export function isReportReadyTelegramEnabled(): boolean {
  const v = process.env.REPORT_READY_TELEGRAM_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/**
 * Kill-switch: default OFF. When on, heavy report jobs get an automatic retry
 * budget (up to REPORT_JOB_MAX_ATTEMPTS claims) for transient/model-variance
 * failures instead of failing terminally on the first error.
 */
export function isReportJobRetryEnabled(): boolean {
  const v = process.env.REPORT_JOB_RETRY_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function reportKindsAsAsyncJobKinds(): AsyncJobKind[] {
  return [...REPORT_JOB_KINDS];
}
