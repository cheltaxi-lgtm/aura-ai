import { isProPdfEnabled } from "../config";
import { PdfError, renderReportPdf } from "@/lib/reports/render-pdf";

export async function renderProReportPdf(opts: { token: string; origin?: string }): Promise<Buffer> {
  if (!isProPdfEnabled()) throw new PdfError(503, "pdf_disabled");
  return renderReportPdf({ path: `/r/${encodeURIComponent(opts.token)}/print` });
}
