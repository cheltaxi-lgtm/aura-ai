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
  GATE_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
  hangingGates,
  hdReportTextToPrintSections,
  sanitizeHdReportText,
  variableSummary,
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
  const cleaned = sanitizeHdReportText(report.reportText);
  const sections = hdReportTextToPrintSections(cleaned);
  const openCenters = (Object.keys(CENTER_NAMES_RU) as HdCenterKey[]).filter(
    (c) => !chart.chart.definedCenters.includes(c)
  );
  const definedChannels = chart.chart.channels.filter((ch) => ch.defined);
  const vars = variableSummary(chart.chart);
  const hang = hangingGates(chart.chart);

  const activationLines = [
    ...chart.chart.personality.map(
      (a) =>
        `Личность · ${a.body}: ${a.gate}.${a.line}.${a.color}.${a.tone}.${a.base} «${GATE_NAMES_RU[a.gate] ?? ""}»`
    ),
    ...chart.chart.designActivations.map(
      (a) =>
        `Дизайн · ${a.body}: ${a.gate}.${a.line}.${a.color}.${a.tone}.${a.base} «${GATE_NAMES_RU[a.gate] ?? ""}»`
    ),
  ];

  const coverSections = [
    {
      key: "cover",
      title: "Обложка · паспорт карты",
      claims: [
        {
          text:
            `**Zovus · Дизайн Человека**\n\n` +
            `Тип: ${typeMeta.nameRu}. Стратегия: ${typeMeta.strategyRu}. ` +
            `Авторитет: ${AUTHORITY_NAMES_RU[chart.chart.authority]}. ` +
            `Профиль: ${chart.chart.profile} «${PROFILE_NAMES_RU[chart.chart.profile] ?? ""}». ` +
            `Определённость: ${DEFINITION_NAMES_RU[chart.chart.definition] ?? chart.chart.definition}.\n\n` +
            `Рождение: ${chart.birthDate.split("-").reverse().join(".")}` +
            ` · ${chart.timeUnknown ? "время неизвестно" : chart.birthTime}` +
            ` · ${chart.placeName}.\n\n` +
            `Тон разбора: ${
              report.reportTone === "child"
                ? "для родителя о ребёнке"
                : report.reportTone === "work"
                  ? "работа и карьера"
                  : "личный"
            }.`,
        },
      ],
    },
    ...sections,
  ];

  return (
    <PrintableReport
      title="Zovus · Дизайн Человека — полный разбор"
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
        {
          label: "Переменные (Солнце)",
          value: `Л ${vars.personalitySun.gate}.${vars.personalitySun.line} c${vars.personalitySun.color}/t${vars.personalitySun.tone}/b${vars.personalitySun.base} · Д ${vars.designSun.gate}.${vars.designSun.line} c${vars.designSun.color}/t${vars.designSun.tone}/b${vars.designSun.base}`,
        },
        { label: "Дата отчёта", value: new Date(report.createdAt).toLocaleString("ru-RU") },
      ]}
      sections={coverSections}
      legacyContent={coverSections.length > 1 ? null : cleaned}
      methodology="Отчёт Zovus построен строго по рассчитанным данным карты Дизайна Человека: точные эфемериды, истинный лунный узел, 88° солярной дуги. В приложении — активации с color/tone/base, висящие ворота и переменные. Текст — символическая интерпретация Эвелины на основе этих данных."
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
          id: "hanging",
          label: "Висящие ворота",
          value: hang.length
            ? hang.map((g) => `${g} «${GATE_NAMES_RU[g] ?? ""}»`).join(", ")
            : "нет",
          confidence: "high",
        },
        {
          id: "variables",
          label: "Переменные · подсказки",
          value: `${vars.cognitionHint} ${vars.environmentHint}`,
          confidence: "medium",
        },
        {
          id: "activations",
          label: "Активации (gate.line.color.tone.base)",
          value: activationLines.join(" · "),
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
