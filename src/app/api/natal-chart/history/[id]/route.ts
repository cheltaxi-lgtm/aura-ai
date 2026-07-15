import { NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { requireProfileUserId } from "@/lib/require-auth";
import { deleteCurrentUserNatalReport } from "@/lib/services/natal-chart-service";
import { isNatalChartEnabled } from "@/lib/settings";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: RouteParams) {
  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }
  const auth = await requireProfileUserId();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforcePaidRouteRateLimit(auth.profileUserId, "natal_report_delete");
  if (limited) return limited;

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Некорректный идентификатор отчёта." }, { status: 400 });
  }

  try {
    const deleted = await deleteCurrentUserNatalReport(auth.profileUserId, id);
    if (!deleted) {
      return NextResponse.json({ error: "Отчёт не найден." }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, report: deleted });
  } catch {
    console.warn("[natal-chart] report delete failed");
    return NextResponse.json({ error: "Не удалось удалить отчёт." }, { status: 500 });
  }
}
