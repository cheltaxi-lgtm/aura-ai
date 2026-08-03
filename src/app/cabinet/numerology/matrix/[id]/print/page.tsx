import { notFound, redirect } from "next/navigation";
import PrintableReport from "@/components/natal/PrintableReport";
import { buildAuthHref } from "@/lib/post-auth-return";
import { isLegacyMatrixCalculationVersion } from "@/lib/numerology/destiny-matrix";
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
  return (
    <PrintableReport
      title="Матрица судьбы"
      meta={[
        { label: "Дата рождения", value: report.birthDate },
        { label: "Дата отчёта", value: new Date(report.createdAt).toLocaleString("ru-RU") },
        ...(isLegacy
          ? [{ label: "Метод расчёта", value: "прежний (до перехода на канонический)" }]
          : []),
      ]}
      sections={[]}
      legacyContent={report.content}
      methodology={
        isLegacy
          ? "Этот разбор посчитан прежним методом свёртки, поэтому его числа могут отличаться от текущей диаграммы. Пересборка по каноническому расчёту доступна бесплатно."
          : "Матрица Zovus строится по дате рождения на 22 арканах и предназначена для саморефлексии."
      }
      disclaimer="Нумерологическая интерпретация носит развлекательный и рефлексивный характер."
      evidence={[]}
      returnHref="/cabinet"
    />
  );
}
