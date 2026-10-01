import type { NumerologyReportHistoryItem } from "@/lib/services/numerology-report-service";
import { destinyMatrix, matrixToStructuredData } from "./destiny-matrix";
import { resolveMatrixForEngine } from "./matrix-snapshot";
import { matrixBaseVersion } from "./matrix-result";
import { matrixCalendarDate } from "./matrix-calendar";

/** A free text repair follows the purchased report, even after the subject cache advances. */
export function matrixReportRepairFacts(report: Pick<NumerologyReportHistoryItem,
  "birthDate" | "calculationVersion" | "structuredData" | "createdAt">) {
  const version = matrixBaseVersion(report.calculationVersion);
  const storedDate = (report.structuredData?.asOf as { date?: unknown } | undefined)?.date;
  const asOfDate = typeof storedDate === "string" ? storedDate : matrixCalendarDate(new Date(report.createdAt));
  const frozen = report.structuredData
    ? resolveMatrixForEngine({ birthDate: report.birthDate, snapshot: report.structuredData, asOfDate }) : null;
  const matrix = frozen?.calculationVersion === version
    ? frozen : destinyMatrix(report.birthDate, { calculationVersion: version, asOfDate });
  if (!matrix) throw new Error("invalid_matrix_report_repair_snapshot");
  return { snapshot: matrixToStructuredData(matrix, report.birthDate), asOfDate: matrix.asOf.date, calculationVersion: matrix.calculationVersion };
}

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
