import { NextRequest, NextResponse } from "next/server";
import { requireProEnabled } from "@/modules/pro/gate";
import { isProDeliveryEnabled, isProPdfEnabled } from "@/modules/pro/config";
import { resolveDeliveryByRawToken } from "@/modules/pro/db/deliveries";
import { renderProReportPdf } from "@/modules/pro/pdf/render-pdf";

export const maxDuration = 120;

type Ctx = { params: Promise<{ token: string }> };

function appOrigin(req: NextRequest): string {
  const env =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.ASYNC_JOB_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  return "http://127.0.0.1:3000";
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const gated = requireProEnabled();
  if (gated) return gated;
  if (!isProDeliveryEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isProPdfEnabled()) {
    return NextResponse.json(
      { error: "pdf_disabled", message: "PDF ещё не включён на сервере" },
      { status: 503 }
    );
  }

  const { token } = await ctx.params;
  const resolved = await resolveDeliveryByRawToken(token);
  if (!resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Prefer loopback for Chromium → Next (same as async worker)
    const origin =
      process.env.ASYNC_JOB_APP_URL?.trim()?.replace(/\/$/, "") ||
      appOrigin(req);
    const pdf = await renderProReportPdf({ token, origin });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="zovus-pro-report.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    const msg = e instanceof Error ? e.message : "pdf_failed";
    return NextResponse.json({ error: msg }, { status });
  }
}
