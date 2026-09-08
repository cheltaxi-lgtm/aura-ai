import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { repairLegacyReadingHeadings } from "@/lib/reading-text-polish";

/** Preserve saved prose; repair only a known historical emphasis corruption. */
export default function ReportRichText({ content }: { content: string }) {
  return <div className="report-rich-text"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    // Reports are self-contained. Remote images must not make export fail or track readers.
    img: ({ alt }) => alt ? <span>{alt}</span> : null,
  }}>{repairLegacyReadingHeadings(content)}</ReactMarkdown></div>;
}
