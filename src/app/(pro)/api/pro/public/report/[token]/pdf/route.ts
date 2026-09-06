import { NextRequest, NextResponse } from "next/server";
import { requireProEnabled } from "@/modules/pro/gate";
import { isProDeliveryEnabled, isProPdfEnabled } from "@/modules/pro/config";
import { resolveDeliveryByRawToken } from "@/modules/pro/db/deliveries";
import { renderProReportPdf } from "@/modules/pro/pdf/render-pdf";
import { PdfError } from "@/lib/reports/render-pdf";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const maxDuration = 100;
export const runtime = "nodejs";
type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const gated = requireProEnabled();
  if (gated) return gated;
  if (!isProDeliveryEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isProPdfEnabled()) return NextResponse.json({ error: "pdf_disabled", message: "PDF временно недоступен. Используйте печатную версию." }, { status: 503 });
  const { token } = await ctx.params;
  const resolved = await resolveDeliveryByRawToken(token);
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = await checkRateLimit(rateLimitKey("pro_pdf", String(resolved.delivery.id)), 12, 3_600_000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limit" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 60) } });
  try {
    const pdf = await renderProReportPdf({ token });
    return new NextResponse(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="zovus-pro-report.pdf"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    const failure = error instanceof PdfError ? error : new PdfError(502, "pdf_render_failed");
    return NextResponse.json({ error: failure.code, message: "Не удалось подготовить PDF. Попробуйте снова или откройте печатную версию." },
      { status: failure.status, headers: { "Cache-Control": "private, no-store", ...(failure.status === 503 ? { "Retry-After": "15" } : {}) } });
  }
}
