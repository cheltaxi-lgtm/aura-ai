import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Preserve the saved prose verbatim; presentation must not rewrite a paid report. */
export default function ReportRichText({ content }: { content: string }) {
  return <div className="report-rich-text"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    // Reports are self-contained. Remote images must not make export fail or track readers.
    img: ({ alt }) => alt ? <span>{alt}</span> : null,
  }}>{content}</ReactMarkdown></div>;
}
