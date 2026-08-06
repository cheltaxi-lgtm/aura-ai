import { notFound, redirect } from "next/navigation";
import { requireProfileUserId } from "@/lib/require-auth";
import PrintableReport from "@/components/natal/PrintableReport";
import { buildAuthHref } from "@/lib/post-auth-return";
import {
  getHdChartById,
  getHdCompositeReportById,
} from "@/lib/services/human-design-service";
import {
  AUTHORITY_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
  analyzeHdConnection,
  hdReportTextToPrintSections,
  sanitizeHdCompositeReportText,
} from "@/lib/human-design";

export const metadata = {
  title: "Печатный отчёт карты связи · Zovus",
  robots: { index: false, follow: false },
};

export default async function HdCompositeReportPrintPage({
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
        `/cabinet/human-design/composite-reports/${encodeURIComponent(id)}/print`
      )
    );
  }

  const report = await getHdCompositeReportById(id, auth.profileUserId);
  if (!report || report.status !== "done" || !report.reportText) notFound();

  const base = await getHdChartById(report.baseChartId);
  const partner = await getHdChartById(report.partnerChartId);
  if (!base || !partner) notFound();

  const labelA =
    base.subjectKind === "other" && base.subjectName?.trim()
      ? base.subjectName.trim()
      : "Первый";
  const labelB =
    partner.subjectKind === "other" && partner.subjectName?.trim()
      ? partner.subjectName.trim()
      : "Второй";

  const conn = analyzeHdConnection(base.chart, partner.chart, {
    a: labelA,
    b: labelB,
  });

  const cleaned = sanitizeHdCompositeReportText(report.reportText);
  const sections = hdReportTextToPrintSections(cleaned);

  return (
    <PrintableReport
      title={`Zovus · Карта связи · ${labelA} × ${labelB}`}
      meta={[
        {
          label: labelA,
          value: `${TYPE_META[conn.typeA].nameRu} · ${conn.profileA} · ${AUTHORITY_NAMES_RU[conn.authorityA]}`,
        },
        {
          label: labelB,
          value: `${TYPE_META[conn.typeB].nameRu} · ${conn.profileB} · ${AUTHORITY_NAMES_RU[conn.authorityB]}`,
        },
        {
          label: "Электромагнетика",
          value: String(conn.stats.electroCount),
        },
        {
          label: "Общие каналы",
          value: String(conn.stats.companionshipCount),
        },
        {
          label: "Общие центры",
          value: String(conn.stats.sharedCenterCount),
        },
        {
          label: "Дата отчёта",
          value: new Date(report.createdAt).toLocaleString("ru-RU"),
        },
      ]}
      sections={sections}
      legacyContent={sections.length ? null : cleaned}
      methodology="Отчёт Zovus по карте связи построен на детерминированной механике Connection Chart (электромагнетика, companionship, dominance, compromise) и рассчитанных данных обеих карт. Текст — символическая интерпретация Эвелины."
      disclaimer="Разбор не заменяет профессиональную консультацию и не является медицинским, юридическим или финансовым советом."
      evidence={[
        {
          id: "electro",
          label: "Электромагнитные каналы",
          value: conn.electromagnetic.length
            ? conn.electromagnetic.map((c) => c.key).join(", ")
            : "нет",
          confidence: "high",
        },
        {
          id: "comp",
          label: "Companionship",
          value: conn.companionship.length
            ? conn.companionship.map((c) => c.key).join(", ")
            : "нет",
          confidence: "high",
        },
        {
          id: "profiles",
          label: "Профили",
          value: `${conn.profileA} «${PROFILE_NAMES_RU[conn.profileA] ?? ""}» × ${conn.profileB} «${PROFILE_NAMES_RU[conn.profileB] ?? ""}»`,
          confidence: "high",
        },
      ]}
      returnHref="/cabinet/human-design"
    />
  );
}
