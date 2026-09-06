"use client";
import { usePathname } from "next/navigation";
import PdfDownloadButton from "@/components/reports/PdfDownloadButton";

export default function PrintButton() {
  const path = usePathname();
  const pro = path?.match(/^\/r\/([^/]+)\/print$/)?.[1];
  const browserOnly = path === "/numerology/destiny-matrix/print";
  return <div className="report-document__actions print:hidden">
    {!browserOnly && <PdfDownloadButton path={path ?? undefined} endpoint={pro ? `/api/pro/public/report/${encodeURIComponent(pro)}/pdf` : undefined} />}
    <button type="button" onClick={() => window.print()}>{browserOnly ? "Печать / сохранить PDF" : "Печать"}</button>
  </div>;
}
