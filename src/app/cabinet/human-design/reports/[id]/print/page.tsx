import { notFound, redirect } from "next/navigation";
import { requireProfileUserId } from "@/lib/require-auth";
import PrintableReport from "@/components/natal/PrintableReport";
import { buildAuthHref } from "@/lib/post-auth-return";
import {
  getHdChartById,
  getHdReportById,
} from "@/lib/services/human-design-service";
import {
  AUTHORITY_NAMES_RU,
  CENTER_NAMES_RU,
  DEFINITION_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
  hdReportTextToPrintSections,
  sanitizeHdReportText,
  type HdCenterKey,
} from "@/lib/human-design";

export const metadata = {
  title: "Печатный отчёт Дизайна Человека · Zovus",
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
  const pkgLabel = report.packageId === "max" ? "Макс" : "Глубина";
  const cleaned = sanitizeHdReportText(report.reportText);
  const sections = hdReportTextToPrintSections(cleaned);
  const openCenters = (Object.keys(CENTER_NAMES_RU) as HdCenterKey[]).filter(
    (c) => !chart.chart.definedCenters.includes(c)
  );
  const definedChannels = chart.chart.channels.filter((ch) => ch.defined);

  return (
    <PrintableReport
      title={`Zovus · Дизайн Человека — «${pkgLabel}»`}
      meta={[
        {
          label: "Данные рождения",
          value: `${chart.birthDate.split("-").reverse().join(".")} · ${
            chart.timeUnknown ? "время неизвестно" : chart.birthTime
          } · ${chart.placeName}`,
        },
        { label: "Тип", value: `${typeMeta.nameRu} · стратегия: ${typeMeta.strategyRu}` },
        { label: "Авторитет", value: AUTHORITY_NAMES_RU[chart.chart.authority] },
        {
          label: "Профиль",
          value: `${chart.chart.profile} · ${PROFILE_NAMES_RU[chart.chart.profile] ?? ""}`,
        },
        {
          label: "Определённость",
          value: DEFINITION_NAMES_RU[chart.chart.definition] ?? chart.chart.definition,
        },
        { label: "Пакет", value: pkgLabel },
        { label: "Дата отчёта", value: new Date(report.createdAt).toLocaleString("ru-RU") },
      ]}
      sections={sections}
      legacyContent={sections.length ? null : cleaned}
      methodology="Отчёт Zovus построен строго по рассчитанным данным карты Дизайна Человека: точные эфемериды, истинный лунный узел, 88° солярной дуги. Текст — символическая интерпретация Эвелины на основе этих данных."
      disclaimer="Разбор не заменяет профессиональную консультацию и не является медицинским, юридическим или финансовым советом."
      evidence={[
        {
          id: "type",
          label: "Тип / стратегия / подпись / ложное «я»",
          value: `${typeMeta.nameRu} · ${typeMeta.strategyRu} · ${typeMeta.signatureRu} · ${typeMeta.notSelfRu}`,
          confidence: "high",
        },
        {
          id: "centers-defined",
          label: "Определённые центры",
          value: chart.chart.definedCenters.length
            ? chart.chart.definedCenters.map((c) => CENTER_NAMES_RU[c]).join(", ")
            : "нет",
          confidence: "high",
        },
        {
          id: "centers-open",
          label: "Открытые центры",
          value: openCenters.length
            ? openCenters.map((c) => CENTER_NAMES_RU[c]).join(", ")
            : "нет",
          confidence: "high",
        },
        {
          id: "channels",
          label: "Определённые каналы",
          value: definedChannels.length
            ? definedChannels.map((ch) => ch.key).join(", ")
            : "нет",
          confidence: "high",
        },
        {
          id: "engine",
          label: "Движок",
          value: chart.engineVersion,
          confidence: "high",
        },
      ]}
      returnHref="/cabinet/human-design"
    />
  );
}
