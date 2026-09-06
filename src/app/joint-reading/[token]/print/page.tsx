import { notFound, redirect } from "next/navigation";
import { requireProfileUserId } from "@/lib/require-auth";
import { getJointReadingByToken, resolveJointParticipantRole } from "@/lib/joint-reading-service";
import { sanitizeSynastryForClient } from "@/lib/natal/synastry";
import CompositeSnapshot from "@/components/reports/CompositeSnapshot";
import PrintableReport from "@/components/natal/PrintableReport";
import { buildAuthHref } from "@/lib/post-auth-return";

export const metadata = { title: "Печатный отчёт об отношениях", robots: { index: false, follow: false } };

export default async function RelationshipPrintPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const auth = await requireProfileUserId();
  if (!auth) redirect(buildAuthHref("/auth/user/login", `/joint-reading/${encodeURIComponent(token)}/print`));
  const row = await getJointReadingByToken(token);
  if (!row || !resolveJointParticipantRole(row, auth.profileUserId) || row.status !== "completed") notFound();
  const synastry = sanitizeSynastryForClient(row.synastry_data);
  const sections = [
    ...(row.initiator_reading?.trim() ? [{ key: "initiator", title: row.initiator_name || "Первый участник", claims: [{ text: row.initiator_reading }] }] : []),
    ...(row.partner_reading?.trim() ? [{ key: "partner", title: row.partner_name || "Второй участник", claims: [{ text: row.partner_reading }] }] : []),
    { key: "summary", title: "Общая интерпретация", claims: [{ text: row.combined_reading ?? "Текст интерпретации отсутствует." }] },
    ...(synastry ? [{
      key: "dimensions", title: "Измерения связи", claims: synastry.dimensions.map((dimension) => ({
        text: `${dimension.label}: ${dimension.band}, индекс ${dimension.index}/100.`,
        evidenceIds: dimension.supportingAspectIds,
      })),
    }] : []),
  ];
  const evidence = synastry?.crossAspects.map((aspect) => ({
    id: aspect.id, label: aspect.label, value: `орб ${aspect.orb}°`, confidence: aspect.strength >= .7 ? "high" : "medium",
  })) ?? [];
  return <PrintableReport title={`${row.initiator_name || "Участник A"} и ${row.partner_name || "Участник B"}`}
    meta={[
      { label: "Версия", value: synastry?.version ?? "Сохранённый разбор" },
      { label: "Дата", value: new Date(row.completed_at ?? row.created_at).toLocaleString("ru-RU") },
      { label: "Метод", value: "Межкартные аспекты и композит" },

    ]}
    visual={<CompositeSnapshot chart={synastry?.composite} />}
    sections={sections}
    methodology="Индексы округлены до шага 5 и детерминированно рассчитаны только из перечисленных межкартных аспектов. Композит использует кратчайший круговой мидпойнт."
    disclaimer="Астрологическая интерпретация не является научным прогнозом."
    evidence={evidence} returnHref={`/joint-reading/${encodeURIComponent(token)}`} />;
}
