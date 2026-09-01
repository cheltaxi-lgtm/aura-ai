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

  if (kind === "hd_composite_report") return "/cabinet/human-design";

  if (kind === "natal_interpretation") return "/cabinet/astrology?tab=reports";
  if (kind === "natal_forecast") return "/cabinet/astrology?tab=timing";
  if (kind === "natal_compatibility") return "/cabinet/astrology?tab=compatibility";
  if (typeof kind === "string" && kind.startsWith("natal_")) {
    return "/cabinet/astrology";
  }

  if (kind === "numerology_reading") {
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

  if (kind === "aura_reading") return "/cabinet";
  if (kind === "palm_reading") return "/gadanie-po-ladoni";

  return null;
}
