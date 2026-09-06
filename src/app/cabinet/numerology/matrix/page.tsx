import Link from "next/link";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { buildAuthHref } from "@/lib/post-auth-return";
import ReportExportActions from "@/components/reports/ReportExportActions";
import { partnerDateFromPairStructuredData } from "@/lib/numerology/matrix-pair-ownership";

export const metadata = { title: "Ваши матрицы и PDF", robots: { index: false, follow: false } };
export default async function MatrixArchive({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const auth = await requireProfileUserId();
  if (!auth) redirect(buildAuthHref("/auth/user/login", "/cabinet/numerology/matrix"));
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page || "1", 10) || 1));
  const { rows } = await query<{ id: string; tool_id: string; birth_date: string; created_at: Date; subject_name: string | null; calculation_version: string; structured_data: Record<string, unknown> | null }>(
    `SELECT n.id,n.tool_id,n.birth_date::text,n.created_at,n.calculation_version,
      jsonb_build_object('partnerDate',n.report_scope) AS structured_data,s.display_name AS subject_name
     FROM numerology_report_history n LEFT JOIN matrix_subjects s ON s.id=n.subject_id AND s.user_id=n.user_id
     WHERE n.user_id=$1 AND n.tool_id IN ('destiny_matrix','child_matrix','matrix_compatibility','matrix_year_forecast') AND length(trim(n.content))>0
     ORDER BY n.created_at DESC,n.id DESC LIMIT 21 OFFSET $2`, [auth.profileUserId, (page-1)*20]);
  const labels: Record<string,string> = { destiny_matrix:"Матрица судьбы",child_matrix:"Матрица ребёнка",matrix_compatibility:"Матрица совместимости",matrix_year_forecast:"Прогноз на год" };
  return <main className="mx-auto max-w-5xl px-5 pt-24 pb-12 text-white">
    <Link href="/cabinet" className="text-sm text-aura-gold">← Личный кабинет</Link>
    <p className="mt-8 text-xs uppercase tracking-[0.2em] text-aura-gold">Ваша личная библиотека</p>
    <h1 className="mt-3 font-display text-4xl">Матрицы и печатные отчёты</h1>
    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">Сохранённые разборы для вас и близких. Откройте печатную версию или скачайте полный PDF — без повторной оплаты.</p>
    <div className="mt-8 grid gap-5 md:grid-cols-2">{rows.slice(0,20).map(row => {
      const partner=partnerDateFromPairStructuredData(row.structured_data);
      return <article key={row.id} className="rounded-2xl border border-aura-gold/20 bg-white/[0.03] p-6">
        <p className="text-xs text-white/40">{row.created_at.toLocaleDateString("ru-RU",{timeZone:"Europe/Moscow"})}</p>
        <h2 className="mt-3 font-display text-2xl">{labels[row.tool_id]}</h2>
        {row.subject_name ? <p className="mt-2 text-white/80">{row.subject_name}</p> : null}
        <p className="mt-2 text-sm text-white/60">{row.birth_date}{partner ? ` · ${partner}` : ""}{row.tool_id==="matrix_year_forecast" ? ` · ${row.calculation_version.split("@")[1] || row.created_at.toLocaleDateString("en-CA", {year:"numeric",timeZone:"Europe/Moscow"})}` : ""}</p>
        <ReportExportActions path={`/cabinet/numerology/matrix/${row.id}/print`} />
      </article>;
    })}</div>
    {!rows.length ? <p className="mt-8 text-white/60">На этой странице пока нет сохранённых разборов. <Link className="text-aura-gold underline" href="/numerology/destiny-matrix">Рассчитать матрицу</Link></p> : null}
    <nav aria-label="Страницы архива" className="mt-8 flex gap-6 text-sm text-aura-gold">
      {page>1 ? <Link href={`?page=${page-1}`}>← Предыдущая</Link> : null}
      {rows.length>20 ? <Link href={`?page=${page+1}`}>Следующая →</Link> : null}
    </nav>
  </main>;
}
