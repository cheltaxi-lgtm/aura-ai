"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { hdReportTextToPrintSections } from "@/lib/human-design";

/** Accordion by ## sections for long premium HD reports. */
export default function HdReportSections({ text }: { text: string }) {
  const sections = hdReportTextToPrintSections(text);
  const [open, setOpen] = useState<Set<string>>(() =>
    new Set(sections[0] ? [sections[0].key] : [])
  );
  const [showAll, setShowAll] = useState(false);

  if (!sections.length) {
    return (
      <div className="hd-report">
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
    );
  }

  if (showAll) {
    return (
      <div className="hd-report-sections">
        <button
          type="button"
          className="hd-report-sections__expand-all hd-print-hidden mb-3"
          onClick={() => setShowAll(false)}
        >
          Показать разделами
        </button>
        <div className="hd-report space-y-6">
          {sections.map((section) => (
            <div key={section.key} id={section.key}>
              <h2>{section.title}</h2>
              <ReactMarkdown>{section.claims.map((c) => c.text).join("\n\n")}</ReactMarkdown>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="hd-report-sections">
      <button
        type="button"
        className="hd-report-sections__expand-all hd-print-hidden mb-3"
        onClick={() => setShowAll(true)}
      >
        Открыть все разделы
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
