import HdStaticBodygraph from "@/components/human-design/HdStaticBodygraph";
import { notFound, redirect } from "next/navigation";
import { requireProfileUserId } from "@/lib/require-auth";
import PrintableReport from "@/components/natal/PrintableReport";
import { buildAuthHref } from "@/lib/post-auth-return";
import {
  getHdReportById,
  isHdReportReadable,
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
  if (!report || !isHdReportReadable(report)) notFound();

  const chart = report.chartSnapshot;
  if (!chart) {
    const cleaned = sanitizeHdReportText(report.reportText);
    const sections = hdReportTextToPrintSections(cleaned);
    return <PrintableReport
      title="Zovus · Дизайн Человека — полный разбор"
      meta={[{ label: "Архивный отчёт", value: "Сохранён исходный текст разбора. Снимок расчётных данных для этого отчёта отсутствует." }]}
      sections={sections} legacyContent={sections.length ? null : cleaned}
      returnHref="/cabinet/human-design"
    />;
  }

  const typeMeta = TYPE_META[chart.chart.type];
  // Use the same immutable chart data that grounded this report.
  const chartNotice = "Схемы и расчётные данные сохранены вместе с этим разбором. Обновления профиля не изменяют отчёт.";
  const cleaned = sanitizeHdReportText(report.reportText);
  const sections = hdReportTextToPrintSections(cleaned);
  const openCenters = (Object.keys(CENTER_NAMES_RU) as HdCenterKey[]).filter(
    (c) => !chart.chart.definedCenters.includes(c)
  );
  const definedChannels = chart.chart.channels.filter((ch) => ch.defined);
  const vars = variableSummary(chart.chart);
  const hang = hangingGates(chart.chart);
  const knownTime = chart.chart.timeKnown;
  const uncertainty = "Время рождения неизвестно. Ниже условная карта; нестабильные характеристики не подтверждены. Переменные, color/tone/base и точная среда не определены.";
  const variablesText = knownTime
    ? vars.variables.map(v => `${v.label}: ${v.direction === "left" ? "←" : "→"}, тон ${v.activation.tone} (${v.source})`).join(" · ")
    : "Не определены без точного времени рождения.";
  const confidence = knownTime ? "high" as const : "low" as const;

  const activationLines = [
    ...chart.chart.personality.map(
      (a) =>
        `Личность · ${a.body}: ${a.gate}.${a.line}${knownTime ? `.${a.color}.${a.tone}.${a.base}` : " (условно)"} «${GATE_NAMES_RU[a.gate] ?? ""}»`
    ),
    ...chart.chart.designActivations.map(
      (a) =>
        `Дизайн · ${a.body}: ${a.gate}.${a.line}${knownTime ? `.${a.color}.${a.tone}.${a.base}` : " (условно)"} «${GATE_NAMES_RU[a.gate] ?? ""}»`
    ),
  ];

  const coverSections = [
    {
      key: "cover",
      title: "Паспорт карты отчёта",
      claims: [
        {
          text:
            `**Zovus · Дизайн Человека**\n\n` +
            (knownTime ? "" : `${uncertainty}\n\n`) +
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
        { label: "Карта и текст отчёта", value: chartNotice },
        ...(!knownTime ? [{ label: "Точность карты", value: uncertainty }] : []),
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
          label: "Четыре переменные",
          value: variablesText,
        },
        { label: "Дата отчёта", value: new Date(report.createdAt).toLocaleString("ru-RU") },
      ]}
      visual={<HdStaticBodygraph chart={chart.chart} theme="light" idPrefix="hd-report-print" className="w-full max-w-sm" />}
      sections={coverSections}
      legacyContent={coverSections.length > 1 ? null : cleaned}
      methodology={`Отчёт Zovus построен по сохранённой карте Дизайна Человека: эфемериды, истинный лунный узел, 88° солярной дуги. ${knownTime ? "В приложении — активации с color/tone/base, висящие ворота и четыре переменные." : uncertainty} Текст — символическая интерпретация Эвелины на основе этих данных.`}
      disclaimer="Разбор не заменяет профессиональную консультацию и не является медицинским, юридическим или финансовым советом."
      evidence={[
        {
          id: "type",
          label: "Тип / стратегия / подпись / ложное «я»",
          value: `${typeMeta.nameRu} · ${typeMeta.strategyRu} · ${typeMeta.signatureRu} · ${typeMeta.notSelfRu}`,
          confidence,
        },
        {
          id: "centers-defined",
          label: "Определённые центры",
          value: chart.chart.definedCenters.length
            ? chart.chart.definedCenters.map((c) => CENTER_NAMES_RU[c]).join(", ")
            : "нет",
          confidence,
        },
        {
          id: "centers-open",
          label: "Открытые центры",
          value: openCenters.length
            ? openCenters.map((c) => CENTER_NAMES_RU[c]).join(", ")
            : "нет",
          confidence,
        },
        {
          id: "channels",
          label: "Определённые каналы",
          value: definedChannels.length
            ? definedChannels.map((ch) => ch.key).join(", ")
            : "нет",
          confidence,
        },
        {
          id: "hanging",
          label: "Висящие ворота",
          value: hang.length
            ? hang.map((g) => `${g} «${GATE_NAMES_RU[g] ?? ""}»`).join(", ")
            : "нет",
          confidence,
        },
        {
          id: "variables",
          label: "Переменные · подсказки",
          value: variablesText,
          confidence: knownTime ? "medium" : "low",
        },
        {
          id: "activations",
          label: knownTime ? "Активации (gate.line.color.tone.base)" : "Условные активации (gate.line)",
          value: activationLines.join(" · "),
          confidence,
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
