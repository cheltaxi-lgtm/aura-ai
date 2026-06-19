"use client";

import { Fragment, type ReactNode } from "react";

/** Strip markdown artifacts and normalize whitespace for display fallback */
export function normalizeMessageText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .trim();
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|«[^»]+»)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t-${partIndex++}`}>
          {text.slice(lastIndex, match.index)}
        </Fragment>
      );
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${partIndex++}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em key={`${keyPrefix}-i-${partIndex++}`} className="text-aura-gold/90 not-italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("«")) {
      nodes.push(
        <span key={`${keyPrefix}-q-${partIndex++}`} className="text-aura-emerald/90">
          {token}
        </span>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}-t-${partIndex}`}>{text.slice(lastIndex)}</Fragment>
    );
  }

  return nodes.length ? nodes : [text];
}

interface MessageContentProps {
  content: string;
  variant?: "assistant" | "user";
}

export default function MessageContent({ content, variant = "assistant" }: MessageContentProps) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return <p className="text-sm leading-relaxed">{content}</p>;
  }

  return (
    <div className={`space-y-3 ${variant === "assistant" ? "master-message" : ""}`}>
      {paragraphs.map((paragraph, index) => {
        const lines = paragraph.split("\n");
        const isCardHeader =
          variant === "assistant" &&
          /^(Прошлое|Настоящее|Будущее|КАРТЫ)\b/i.test(lines[0] ?? "");

        return (
          <p
            key={index}
            className={`text-sm leading-relaxed ${
              isCardHeader
                ? "border-l-2 border-aura-gold/40 pl-3 font-medium text-aura-gold"
                : "text-gray-100"
            }`}
          >
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line, `${index}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
