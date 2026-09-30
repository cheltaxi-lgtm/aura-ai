import type { NumerologyReportHistoryItem } from "@/lib/services/numerology-report-service";

/** Display identity comes from the report actually delivered, including legacy versions. */
export function matrixReportDisplayMetadata(report: Pick<NumerologyReportHistoryItem,
  "birthDate" | "calculationVersion" | "structuredData" | "createdAt">) {
  const snapshot = report.structuredData ?? null;
  const asOf = snapshot?.asOf as { date?: unknown } | undefined;
  return {
    matrixBirthDate: report.birthDate,
    matrixCalculationVersion: report.calculationVersion,
    matrixStructuredData: snapshot,
    matrixAsOf: typeof asOf?.date === "string" ? asOf.date : report.createdAt,
  };
}
