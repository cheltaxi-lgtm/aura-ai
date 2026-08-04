import { notFound, redirect } from "next/navigation";
import { requireProfileUserId } from "@/lib/require-auth";
import PrintableReport from "@/components/natal/PrintableReport";
import { buildAuthHref } from "@/lib/post-auth-return";
import {
  getHdChartById,
  getHdReportById,
} from "@/lib/services/human-design-service";
import { TYPE_META, AUTHORITY_NAMES_RU, PROFILE_NAMES_RU } from "@/lib/human-design";

export const metadata = {
  title: "Печатный отчёт Дизайна Человека",
  robots: { index: false, follow: false },
};

export default async function HdReportPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await requireProfileUserId();
  if (!auth) {
    redirect(
      buildAuthHref(
        "/auth/user/login",
        `/cabinet/human-design/reports/${encodeURIComponent(id)}/print`
      )
    );
  }

  const report = await getHdReportById(id, auth.profileUserId);
  if (!report || report.status !== "done" || !report.reportText) notFound();

  const chart = await getHdChartById(report.chartId);
  if (!chart) notFound();

  const typeMeta = TYPE_META[chart.chart.type];
  return (
    <PrintableReport
      title="Дизайн Человека — персональный разбор"
      meta={[
        {
          label: "Данные рождения",
          value: `${chart.birthDate.split("-").reverse().join(".")} · ${chart.timeUnknown ? "время неизвестно" : chart.birthTime} · ${chart.placeName}`,
        },
        { label: "Тип", value: `${typeMeta.nameRu} · ${typeMeta.strategyRu}` },
        { label: "Авторитет", value: AUTHORITY_NAMES_RU[chart.chart.authority] },
        {
          label: "Профиль",
          value: `${chart.chart.profile} · ${PROFILE_NAMES_RU[chart.chart.profile] ?? ""}`,
        },
        { label: "Дата отчёта", value: new Date(report.createdAt).toLocaleString("ru-RU") },
        { label: "Движок", value: chart.engineVersion },
      ]}
      sections={[]}
      legacyContent={report.reportText}
      methodology="Отчёт построен строго по рассчитанным данным карты Дизайна Человека (точные эфемериды, истинный лунный узел, 88° солярной дуги)."
      disclaimer="Разбор является символической интерпретацией системы Дизайна Человека и не заменяет профессиональную консультацию."
      returnHref="/cabinet/human-design"
    />
  );
}
