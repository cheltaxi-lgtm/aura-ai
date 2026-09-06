import { notFound, redirect } from "next/navigation";
import ReadingSnapshot from "@/components/reports/ReadingSnapshot";
import PrintableReport from "@/components/natal/PrintableReport";
import { requireProfileUserId } from "@/lib/require-auth";
import { buildAuthHref } from "@/lib/post-auth-return";
import { getSavedReadingDocument } from "@/lib/reports/saved-reading";
import MatrixPrintPage from "@/app/cabinet/numerology/matrix/[id]/print/page";

export const metadata = { title: "Ваш отчёт · Zovus", robots: { index: false, follow: false } };

export default async function SavedReadingPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireProfileUserId();
  if (!auth) redirect(buildAuthHref("/auth/user/login", `/cabinet/readings/${encodeURIComponent(id)}/print`));
  const report = await getSavedReadingDocument(auth.profileUserId, id);
  if (!report?.body.trim()) notFound();
  if (report.printPath) return MatrixPrintPage({ params: Promise.resolve({ id: report.printPath.split("/")[4] }) });
  return <PrintableReport title={report.title} meta={[
    { label: "Наставник", value: report.master },
    { label: "Дата", value: new Date(report.date).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }) },
    ...(report.question ? [{ label: "Ваш вопрос", value: report.question }] : []),
    ...(report.cards?.length ? [{ label: "Карты", value: report.cards.join(" · ") }] : []),
  ]} visual={<ReadingSnapshot kind={report.kind} snapshot={report.snapshot} />} sections={[]} legacyContent={report.body} returnHref="/cabinet"
    disclaimer="Символическая интерпретация для самопознания. Не является научным прогнозом и не заменяет профессиональную консультацию." />;
}
