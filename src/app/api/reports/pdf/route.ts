import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { hasAccountAgeConfirmed, getProfileUserIdForAccount } from "@/lib/accounts";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { printPathKind } from "@/lib/reports/pdf-policy";
import { PdfError, renderReportPdf } from "@/lib/reports/render-pdf";
import { createHash } from "node:crypto";
import { clientIp } from "@/lib/api-guards";
import { getActivePublicReportShare } from "@/lib/services/public-report-share-service";
import { privatePdfAvailable } from "@/lib/reports/private-pdf-access";

export const runtime = "nodejs";
export const maxDuration = 100;

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path") ?? "";
  const kind = printPathKind(path);
  if (!kind || path.startsWith("/r/")) return NextResponse.json({ error: "invalid_report_path" }, { status: 400 });
  const auth = await requireUserAuth();
  if (kind === "private" && !auth) return NextResponse.json({ error: "auth_required" }, { status: 401 });
  if (kind === "private" && auth && !(await hasAccountAgeConfirmed(auth.sub))) {
    return NextResponse.json({ error: "age_confirmation_required" }, { status: 403 });
  }
  const identity = auth?.sub ?? createHash("sha256").update(clientIp(request)).digest("hex");
  const limit = await checkRateLimit(rateLimitKey("report_pdf", identity), 12, 3_600_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limit", message: "Слишком много выгрузок. Попробуйте немного позже." },
    { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 60), "Cache-Control": "private, no-store" } });
  try {
    if (kind === "private" && auth) {
      const profileId = await getProfileUserIdForAccount(auth.sub);
      if (!profileId || !(await privatePdfAvailable(path, profileId))) {
        return NextResponse.json({ error: "report_unavailable", message: "Отчёт недоступен или ещё не готов." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
      }
    }
    if (kind === "public" && !(await getActivePublicReportShare(path.split("/")[3]))) {
      return NextResponse.json({ error: "report_unavailable" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }
    const bytes = await renderReportPdf({ path, authCookie: kind === "private" ? request.cookies.get("aura_auth")?.value : undefined });
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="zovus-report.pdf"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    const failure = error instanceof PdfError ? error : error instanceof Error && error.message === "report_too_long" ? new PdfError(413, "report_too_long") : new PdfError(502, "pdf_render_failed");
    return NextResponse.json({ error: failure.code, message: "Не удалось подготовить PDF. Повторите попытку или воспользуйтесь печатной версией." },
      { status: failure.status, headers: { "Cache-Control": "private, no-store", ...(failure.status === 503 ? { "Retry-After": "15" } : {}) } });
  }
}
