import type { AsyncJobKind } from "@/lib/async-jobs";

/**
 * Единый resolver постоянной ссылки на отчёт.
 * Источники по приоритету: result (после завершения) → input (при постановке) →
 * безопасный fallback раздела. Клиентские returnUrl не принимаются — только
 * внутренние пути, построенные на сервере.
 */
export function resolveAsyncReportDestination(input: {
  kind: AsyncJobKind | string;
  jobInput?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
}): string | null {
  const { kind } = input;
  const jobInput = input.jobInput ?? {};
  const result = input.result ?? {};

  if (kind === "hd_report") {
    const fromResult = result.report as { chartId?: string } | undefined;
    const chartId =
      (typeof fromResult?.chartId === "string" && fromResult.chartId) ||
      (typeof result.chartId === "string" && result.chartId) ||
      (typeof jobInput.chartId === "string" ? jobInput.chartId : "");
    return chartId
      ? `/cabinet/human-design?chart=${encodeURIComponent(chartId)}`
      : "/cabinet/human-design";
  }

  if (kind === "hd_composite_report") {
    const report = result.report as
      | { baseChartId?: string; partnerChartId?: string }
      | undefined;
    const baseChartId =
      (typeof report?.baseChartId === "string" && report.baseChartId.trim()) ||
      (typeof jobInput.baseChartId === "string" && jobInput.baseChartId.trim()) ||
      "";
    const partnerChartId =
      (typeof report?.partnerChartId === "string" && report.partnerChartId.trim()) ||
      (typeof jobInput.partnerChartId === "string" && jobInput.partnerChartId.trim()) ||
      "";
    return baseChartId && partnerChartId
      ? `/cabinet/human-design?chart=${encodeURIComponent(baseChartId)}&partner=${encodeURIComponent(partnerChartId)}`
      : "/cabinet/human-design";
  }

  if (kind === "natal_interpretation" || kind === "natal_forecast") {
    const reportId =
      typeof result.reportId === "string" ? result.reportId.trim() : "";
    if (reportId) {
      return `/cabinet/astrology?tab=reports&report=${encodeURIComponent(reportId)}`;
    }
    return kind === "natal_forecast"
      ? "/cabinet/astrology?tab=timing"
      : "/cabinet/astrology?tab=reports";
  }
  if (kind === "natal_compatibility") {
    const record = result.record as { id?: string } | undefined;
    const compatibilityId =
      (typeof record?.id === "string" && record.id.trim()) ||
      (typeof jobInput.id === "string" && jobInput.id.trim()) ||
      "";
    return compatibilityId && Object.keys(result).length > 0
      ? `/cabinet/astrology?tab=compatibility&compatibility=${encodeURIComponent(compatibilityId)}`
      : "/cabinet/astrology?tab=compatibility";
  }
  if (typeof kind === "string" && kind.startsWith("natal_")) {
    return "/cabinet/astrology";
  }

  if (kind === "numerology_reading") {
    const sessionId =
      (typeof result.sessionId === "string" && result.sessionId.trim()) ||
      (typeof jobInput.sessionId === "string" && jobInput.sessionId.trim()) ||
      "";
    // The same resolver is used when a job is merely accepted. Only a completed
    // result may deep-link into the saved chat session.
    if (sessionId && Object.keys(result).length > 0) {
      return `/?master=numerolog&resume=chat&sessionId=${encodeURIComponent(sessionId)}`;
    }
    const toolId =
      typeof jobInput.numerologToolId === "string" && jobInput.numerologToolId.trim()
        ? jobInput.numerologToolId.trim()
        : "destiny_matrix";
    const subjectId =
      typeof jobInput.matrixSubjectId === "string" && jobInput.matrixSubjectId.trim()
        ? `&subjectId=${encodeURIComponent(jobInput.matrixSubjectId.trim())}`
        : "";
    return `/?numerolog=1&tool=${encodeURIComponent(toolId)}${subjectId}`;
  }

  if (kind === "pro_premium_report") {
    const caseId =
      (typeof result.caseId === "string" && result.caseId) ||
      (typeof jobInput.caseId === "string" ? jobInput.caseId : "");
    return caseId ? `/pro/case/${encodeURIComponent(caseId)}` : "/pro";
  }

  if (kind === "aura_reading") {
    const readingId =
      (typeof result.historyId === "string" && result.historyId.trim()) ||
      (typeof result.snapshotId === "string" && result.snapshotId.trim()) ||
      "";
    return readingId
      ? `/aura?reading=${encodeURIComponent(readingId)}`
      : "/aura";
  }
  if (kind === "palm_reading") {
    const readingId =
      (typeof result.snapshotId === "string" && result.snapshotId.trim()) ||
      (typeof result.historyId === "string" && result.historyId.trim()) ||
      "";
    return readingId
      ? `/gadanie-po-ladoni?reading=${encodeURIComponent(readingId)}`
      : "/gadanie-po-ladoni";
  }

  return null;
}
