import { notFound, redirect } from "next/navigation";
import { partnerDateFromPairStructuredData } from "@/lib/numerology/matrix-pair-ownership";
import PrintableReport from "@/components/natal/PrintableReport";
import { buildAuthHref } from "@/lib/post-auth-return";
import {
  classifyMatrixReportVersion,
  isLegacyMatrixCalculationVersion,
} from "@/lib/numerology/destiny-matrix";
import {
  clientSafeMatrixResolveError,
  clientSafeMatrixVersionLabel,
} from "@/lib/numerology/matrix-labels";
import { buildMatrixDiagramSvgFromResult } from "@/lib/numerology/matrix-diagram-svg";
import { hydrateDestinyMatrixFromSnapshot, resolveMatrixForDisplayDetailed } from "@/lib/numerology/matrix-snapshot";
import { requireProfileUserId } from "@/lib/require-auth";
import { getUserMatrixReportById } from "@/lib/services/numerology-report-service";

export const metadata = {
  title: "Печать матрицы судьбы",
  robots: { index: false, follow: false },
};

export default async function MatrixPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireProfileUserId();
  if (!auth) {
    redirect(buildAuthHref("/auth/user/login", `/cabinet/numerology/matrix/${encodeURIComponent(id)}/print`));
  }
  const report = await getUserMatrixReportById(auth.profileUserId, id);
  if (!report) notFound();
  // Pre-v3 reports stay printable — they were paid for — but their numbers came from
  // the retired digit-sum reducer and will not match the diagram shown today.
  const partnerDate = partnerDateFromPairStructuredData(report.structuredData);
  const title = ({child_matrix: "Матрица ребёнка", matrix_compatibility: "Матрица совместимости", matrix_year_forecast: "Прогноз по матрице на год"} as Record<string, string>)[report.toolId] ?? "Матрица судьбы";
  const isLegacy = isLegacyMatrixCalculationVersion(report.calculationVersion);
  const resolved = resolveMatrixForDisplayDetailed({
    birthDate: report.birthDate,
    structuredData: report.structuredData,
    calculationVersion: report.calculationVersion,
    createdAt: report.createdAt,
  });
  const matrix = resolved.ok ? resolved.matrix : null;
  const diagramSvg = matrix
    ? buildMatrixDiagramSvgFromResult(matrix, {
        theme: "print",
        density: "full",
        uid: "print",
      })
    : null;
  const partnerMatrix = hydrateDestinyMatrixFromSnapshot(report.structuredData?.partnerMatrix as Record<string, unknown> | null);
  const partnerSvg = partnerMatrix ? buildMatrixDiagramSvgFromResult(partnerMatrix, {theme:"print", density:"full", uid:"partner-print"}) : null;
  return (
    <PrintableReport
      title={title}
      meta={[
        { label: report.toolId === "matrix_compatibility" ? "Первый участник · дата рождения" : "Дата рождения", value: report.birthDate },
        ...(partnerDate ? [{ label: "Второй участник · дата рождения", value: partnerDate }] : []),
        ...(report.toolId === "matrix_year_forecast" ? [{label:"Год прогноза", value: report.calculationVersion.split("@")[1] || new Date(report.createdAt).toLocaleDateString("en-CA", {year:"numeric",timeZone:"Europe/Moscow"})}] : []),
        { label: "Дата отчёта", value: new Date(report.createdAt).toLocaleString("ru-RU", {timeZone:"Europe/Moscow"}) },
        {
          label: "Методика",
          value: clientSafeMatrixVersionLabel(
            classifyMatrixReportVersion({
              calculationVersion: report.calculationVersion,
            })
          ),
        },
        ...(isLegacy
          ? [{ label: "Метод", value: "сохранённый разбор (числа не пересчитываются)" }]
          : []),
        ...(!resolved.ok
          ? [{ label: "Схема", value: clientSafeMatrixResolveError(resolved.error) }]
          : []),
      ]}
      sections={[]}
      visual={
        diagramSvg ? (
          <><figure><div
            className="destiny-matrix-frame destiny-matrix-figure--print w-full max-w-xl"
            dangerouslySetInnerHTML={{ __html: diagramSvg }}
          /><figcaption>{report.toolId === "matrix_compatibility" ? "Личная матрица первого участника. Разбор пары приведён в тексте отчёта." : "Матрица по сохранённым расчётным данным"}</figcaption></figure>{partnerSvg ? <figure><div className="destiny-matrix-frame destiny-matrix-figure--print w-full max-w-xl" dangerouslySetInnerHTML={{__html:partnerSvg}} /><figcaption>Личная матрица второго участника</figcaption></figure> : null}</>
        ) : null
      }
      legacyContent={report.content}
      methodology={
        !resolved.ok
          ? clientSafeMatrixResolveError(resolved.error)
          : isLegacy
            ? "Этот разбор сохранён как есть. Новая версия движка его не пересчитывает и не заменяет."
            : "Матрица судьбы Zovus · система 22 энергий. Интерпретация для саморефлексии, не научный прогноз."
      }
      disclaimer="Нумерологическая интерпретация носит развлекательный и рефлексивный характер."
      evidence={[]}
      returnHref="/cabinet/numerology/matrix"
    />
  );
}
