"use client";
import Link from "next/link";
import PdfDownloadButton from "./PdfDownloadButton";
import ReadingJourney from "@/components/ReadingJourney";

export default function ReportExportActions({ path, journey=false, noteLink=false, noteReadingId }: { path: string; journey?:boolean; noteLink?:boolean; noteReadingId?:string }) {
  const readingId=path.match(/\/([0-9a-f-]{36})\/print$/i)?.[1];
  const noteId=noteReadingId??readingId;
  return <><div className="report-export-actions print:hidden">
    <PdfDownloadButton path={path} />
    <Link href={path}>Печатная версия</Link>
    {noteLink && noteId && <a href={`/cabinet?tab=history&readingId=${encodeURIComponent(noteId)}`}>Личная заметка</a>}
  </div>{journey && readingId && <ReadingJourney readingId={readingId} />}</>;
}
