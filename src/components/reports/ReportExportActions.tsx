"use client";
import Link from "next/link";
import PdfDownloadButton from "./PdfDownloadButton";
import ReadingJourney from "@/components/ReadingJourney";

export default function ReportExportActions({ path, journey=false }: { path: string; journey?:boolean }) {
  const readingId=path.match(/\/([0-9a-f-]{36})\/print$/i)?.[1];
  return <><div className="report-export-actions print:hidden">
    <PdfDownloadButton path={path} />
    <Link href={path}>Печатная версия</Link>
  </div>{journey && readingId && <ReadingJourney readingId={readingId} />}</>;
}
