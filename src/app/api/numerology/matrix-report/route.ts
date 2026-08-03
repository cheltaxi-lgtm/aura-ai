import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { requireProfileUserId } from "@/lib/require-auth";
import { PRICING } from "@/lib/config/pricing";
import { wipeUserMatrixReports } from "@/lib/numerology/matrix-session-cleanup";
import {
  findOwnedMatrixReport,
  listUserMatrixReports,
  toIsoBirthDate,
} from "@/lib/services/numerology-report-service";

/** GET owned Full Matrix report status (buy-once unlock). */
export async function GET(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "numerology_matrix_report"
  );
  if (limited) return limited;

  const birthDateParam = request.nextUrl.searchParams.get("birthDate");
  const list = request.nextUrl.searchParams.get("list") === "1";

  try {
    if (list) {
      const reports = await listUserMatrixReports(auth.profileUserId, 20);
      return NextResponse.json({
        reports,
        includedQuestions: PRICING.MATRIX_INCLUDED_QUESTIONS,
        sessionCost: PRICING.NUMEROLOGY_SESSION,
      });
    }

    const birthDate = toIsoBirthDate(birthDateParam);
    if (!birthDate) {
      return NextResponse.json(
        { error: "birthDate required (YYYY-MM-DD or ДД.ММ.ГГГГ)" },
        { status: 400 }
      );
    }

    const report = await findOwnedMatrixReport(auth.profileUserId, birthDate);
    const hasContent = Boolean(report?.content?.trim());
    return NextResponse.json({
      owned: hasContent,
      report: hasContent && report
        ? {
            id: report.id,
            birthDate: report.birthDate,
            calculationVersion: report.calculationVersion,
            createdAt: report.createdAt,
            // Content is loaded via /api/reading reuse; preview only needs ownership.
            hasContent: true,
          }
        : null,
      includedQuestions: PRICING.MATRIX_INCLUDED_QUESTIONS,
      sessionCost: PRICING.NUMEROLOGY_SESSION,
    });
  } catch (err) {
    console.warn("[numerology] matrix-report lookup failed:", err);
    return NextResponse.json(
      { error: "Не удалось проверить сохранённый разбор матрицы." },
      { status: 500 }
    );
  }
}

/**
 * DELETE owned matrix report(s) + linked consultation sessions.
 * Body/query: reportId and/or birthDate (ISO or ДД.ММ.ГГГГ).
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireProfileUserId();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await enforcePaidRouteRateLimit(
    auth.profileUserId,
    "numerology_matrix_report_delete"
  );
  if (limited) return limited;

  let reportId: string | null =
    request.nextUrl.searchParams.get("reportId")?.trim() || null;
  let birthDateRaw: string | null =
    request.nextUrl.searchParams.get("birthDate")?.trim() || null;

  try {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (body) {
      if (!reportId && typeof body.reportId === "string") {
        reportId = body.reportId.trim() || null;
      }
      if (!birthDateRaw && typeof body.birthDate === "string") {
        birthDateRaw = body.birthDate.trim() || null;
      }
    }
  } catch {
    /* empty body ok */
  }

  if (!reportId && !toIsoBirthDate(birthDateRaw)) {
    return NextResponse.json(
      { error: "Укажите reportId или birthDate для удаления." },
      { status: 400 }
    );
  }

  try {
    const wiped = await wipeUserMatrixReports({
      userId: auth.profileUserId,
      reportId,
      birthDate: birthDateRaw,
    });

    if (wiped.deletedReports < 1) {
      return NextResponse.json(
        { error: "Сохранённая матрица не найдена.", deleted: 0 },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: wiped.deletedReports,
      purgedSessions: wiped.purgedSessions,
      birthDates: wiped.birthDates,
      message: "Матрица удалена. Можно рассчитать и получить разбор заново.",
    });
  } catch (err) {
    console.error("[numerology] matrix-report delete failed:", err);
    return NextResponse.json(
      { error: "Не удалось удалить матрицу. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
