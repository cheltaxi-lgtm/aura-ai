import { notFound, redirect } from "next/navigation";
import PrintableReport from "@/components/natal/PrintableReport";
import { buildAuthHref } from "@/lib/post-auth-return";
import { requireProfileUserId } from "@/lib/require-auth";
import { getCompatibilityRecord } from "@/lib/services/natal-compatibility-service";

export const metadata = {
  title: "Печатный отчёт совместимости",
  robots: { index: false, follow: false },
};

export default async function CompatibilityPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const returnTo = `/cabinet/astrology/compatibility/${encodeURIComponent(id)}/print`;
  const auth = await requireProfileUserId();
  if (!auth) redirect(buildAuthHref("/auth/user/login", returnTo));

  const record = await getCompatibilityRecord(id, auth.profileUserId);
  if (!record?.report) notFound();

  const evidence = record.evidence
    ? [
        ...record.evidence.dimensions.map((dimension) => ({
          id: `dimension:${dimension.key}`,
          label: dimension.label,
          value: `${dimension.index}/100 · ${dimension.band}`,
        })),
        ...record.evidence.crossAspects.map((aspect) => ({
          id: aspect.id,
          label: aspect.label,
          value: `Орб ${aspect.orb.toFixed(2)}°`,
        })),
      ]
    : [];

  return (
    <PrintableReport
      title={`Совместимость: ${record.ownerLabel} и ${record.partnerLabel}`}
      meta={[
        { label: "Тип", value: "Синастрия и композит" },
        { label: "Версия расчёта", value: record.synastry?.version ?? "—" },
        {
          label: "Дата",
          value: new Date(record.completedAt ?? record.createdAt).toLocaleString("ru-RU"),
        },
        { label: "Стоимость", value: `${record.runeCost ?? "—"} ᚢ` },
      ]}
      sections={record.report.sections}
      methodology="Индексы основаны на рассчитанных межкартных аспектах; композит построен по круговым мидпойнтам. Исходные данные рождения и координаты в отчёт не включены."
      disclaimer={record.report.disclaimer}
      evidence={evidence}
      returnHref="/cabinet/astrology?tab=compatibility"
    />
  );
}
