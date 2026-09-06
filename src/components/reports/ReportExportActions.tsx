"use client";
import Link from "next/link";
import PdfDownloadButton from "./PdfDownloadButton";

export default function ReportExportActions({ path }: { path: string }) {
  return <div className="report-export-actions print:hidden">
    <PdfDownloadButton path={path} />
    <Link href={path}>Печатная версия</Link>
  </div>;
}
