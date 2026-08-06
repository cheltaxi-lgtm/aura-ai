"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { hdReportTextToPrintSections } from "@/lib/human-design";

/** Full HD report with optional accordion navigation (full text by default). */
export default function HdReportSections({ text }: { text: string }) {
  const sections = useMemo(() => hdReportTextToPrintSections(text), [text]);
  const [mode, setMode] = useState<"full" | "toc">("full");
  const [open, setOpen] = useState<Set<string>>(() => new Set(sections.map((s) => s.key)));

  if (!text.trim()) return null;

  if (!sections.length || mode === "full") {
    return (
      <div className="hd-report-sections">
        {sections.length > 1 && (
          <button
            type="button"
            className="hd-report-sections__expand-all hd-print-hidden mb-3"
            onClick={() => setMode("toc")}
          >
            Свернуть по разделам ({sections.length})
          </button>
        )}
        <div className="hd-report">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className="hd-report-sections">
      <button
        type="button"
        className="hd-report-sections__expand-all hd-print-hidden mb-3"
        onClick={() => setMode("full")}
      >
        Показать полный текст
      </button>
      {sections.map((section) => {
        const isOpen = open.has(section.key);
        const body = section.claims.map((c) => c.text).join("\n\n");
        return (
          <section
            key={section.key}
            className="hd-report-sections__item"
            data-open={isOpen || undefined}
          >
            <button
              type="button"
              className="hd-report-sections__head"
              aria-expanded={isOpen}
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(section.key)) next.delete(section.key);
                  else next.add(section.key);
                  return next;
                })
              }
            >
              <span>{section.title}</span>
              <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="hd-report-sections__body hd-report">
                <ReactMarkdown>{body}</ReactMarkdown>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
