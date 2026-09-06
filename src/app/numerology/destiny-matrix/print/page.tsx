import { notFound } from "next/navigation";
import PrintableReport from "@/components/natal/PrintableReport";
import { destinyMatrix } from "@/lib/numerology/destiny-matrix";
import { buildMatrixFreeSummary } from "@/lib/numerology/matrix-free-summary";
import { buildMatrixDiagramSvgFromResult } from "@/lib/numerology/matrix-diagram-svg";
import { matrixCalendarDate } from "@/lib/numerology/matrix-calendar";
import { parseBirthDate } from "@/lib/numerology/constants";
import { buildMatrixCompatFreeSummary } from "@/lib/numerology/matrix-compat-free-summary";

export const metadata = { title: "Печатный расчёт матрицы", robots: { index: false, follow: false } };
export default async function MatrixPreviewPrint({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const birthDate = typeof params.birthDate === "string" ? params.birthDate : "";
  const partnerDate = typeof params.partnerDate === "string" ? params.partnerDate : "";
  const asOfDate = typeof params.asOfDate === "string" ? params.asOfDate : matrixCalendarDate();
  const version = typeof params.version === "string" ? params.version : "matrix-v5";
  if (!parseBirthDate(birthDate) || !parseBirthDate(asOfDate) || !["matrix-v3", "matrix-v4", "matrix-v5"].includes(version) || (partnerDate && !parseBirthDate(partnerDate))) notFound();
  const matrix = destinyMatrix(birthDate, { asOfDate, calculationVersion: version });
  if (!matrix) notFound();
  const summary = buildMatrixFreeSummary(birthDate, { matrix });
  if (!summary) notFound();
  const pair = partnerDate ? buildMatrixCompatFreeSummary(birthDate, partnerDate, { asOfDate, calculationVersion: version }) : null;
  const visual = <div dangerouslySetInnerHTML={{ __html: buildMatrixDiagramSvgFromResult(matrix, { theme: "print", density: "full", uid: "free-print" }) }} />;
  const sections = pair ? [
    { key: "pair", title: `Совместимость · ${pair.score}/100`, claims: [{ text: pair.summary }] },
    ...pair.zones.map(zone => ({ key: zone.id, title: zone.label, claims: [{ text: `${zone.numberA} — ${zone.titleA} / ${zone.numberB} — ${zone.titleB}\n\n${zone.note}` }] })),
    { key: "strengths", title: "Опоры пары", claims: [{ text: pair.strengths.join("\n\n") }] },
    { key: "tensions", title: "Зоны внимания", claims: [{ text: pair.tensions.join("\n\n") }] },
  ] : [
    { key: "portrait", title: "Портрет матрицы", claims: [{ text: summary.portrait }] },
    { key: "money", title: "Деньги", claims: [{ text: summary.moneyInsight }] },
    { key: "love", title: "Отношения", claims: [{ text: summary.loveInsight }] },
    { key: "period", title: "Текущий период", claims: [{ text: summary.yearInsight }] },
  ];
  return <PrintableReport title={pair ? "Матрица совместимости · бесплатный расчёт" : "Матрица судьбы · бесплатный расчёт"}
    meta={[{ label: "Дата рождения", value: birthDate }, ...(partnerDate ? [{ label: "Партнёр", value: partnerDate }] : []), { label: "Период расчёта", value: asOfDate }]}
    visual={<figure>{visual}<figcaption>{pair ? "Личная матрица первого участника" : "Схема расчёта"}</figcaption></figure>} sections={sections}
    methodology="Краткий расчёт по системе 22 энергий Zovus. Полный оплаченный разбор скачивается отдельно из чата или кабинета."
    disclaimer="Нумерологическая интерпретация для саморефлексии, не научный прогноз."
    returnHref={pair ? "/numerology/matrica-sovmestimosti" : "/numerology/destiny-matrix"} />;
}
