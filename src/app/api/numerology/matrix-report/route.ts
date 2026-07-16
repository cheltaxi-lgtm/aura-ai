import { NextRequest, NextResponse } from "next/server";

import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { requireProfileUserId } from "@/lib/require-auth";
import { PRICING } from "@/lib/config/pricing";
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
    return NextResponse.json({
      owned: Boolean(report),
      report: report
        ? {
            id: report.id,
            birthDate: report.birthDate,
            calculationVersion: report.calculationVersion,
            createdAt: report.createdAt,
            // Content is loaded via /api/reading reuse; preview only needs ownership.
            hasContent: Boolean(report.content?.trim()),
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
