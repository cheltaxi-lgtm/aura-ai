import { notFound, redirect } from "next/navigation";
import PrintableReport from "@/components/natal/PrintableReport";
import { buildAuthHref } from "@/lib/post-auth-return";
import {
  classifyMatrixReportVersion,
  isLegacyMatrixCalculationVersion,
} from "@/lib/numerology/destiny-matrix";
import { clientSafeMatrixVersionLabel } from "@/lib/numerology/matrix-labels";
import { buildMatrixDiagramSvgFromResult } from "@/lib/numerology/matrix-diagram-svg";
import { resolveMatrixForDisplay } from "@/lib/numerology/matrix-snapshot";
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
  const isLegacy = isLegacyMatrixCalculationVersion(report.calculationVersion);
  const matrix = resolveMatrixForDisplay({
    birthDate: report.birthDate,
    structuredData: report.structuredData,
    calculationVersion: report.calculationVersion,
    createdAt: report.createdAt,
  });
  const diagramSvg = matrix
    ? buildMatrixDiagramSvgFromResult(matrix, {
        theme: "print",
        density: "full",
        uid: "print",
      })
    : null;
  return (
    <PrintableReport
      title="Матрица судьбы"
      meta={[
        { label: "Дата рождения", value: report.birthDate },
        { label: "Дата отчёта", value: new Date(report.createdAt).toLocaleString("ru-RU") },
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
      ]}
      sections={[]}
      visual={
        diagramSvg ? (
          <div
            className="destiny-matrix-frame destiny-matrix-figure--print w-full max-w-xl"
            dangerouslySetInnerHTML={{ __html: diagramSvg }}
          />
        ) : null
      }
      legacyContent={report.content}
      methodology={
        isLegacy
          ? "Этот разбор сохранён как есть. Новая версия движка его не пересчитывает и не заменяет."
          : "Матрица судьбы Zovus · система 22 энергий. Интерпретация для саморефлексии, не научный прогноз."
      }
      disclaimer="Нумерологическая интерпретация носит развлекательный и рефлексивный характер."
      evidence={[]}
      returnHref="/cabinet"
    />
  );
}
