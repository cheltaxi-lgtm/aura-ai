"use client";

import { Fragment, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { toParagraphs, splitWallOfText } from "@/lib/format-paragraphs";
import {
  cardNamesFromImageMarkdown,
  inferSpreadCardNames,
  polishSpreadReadingText,
} from "@/lib/reading-text-polish";

export interface ChatMessageRendererProps {
  content: string;
  role?: "user" | "assistant";
  className?: string;
}

const CARD_IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;

/** Normalize Evelina-style em-dash lists and dividers for react-markdown. */
function normalizeMasterMarkdown(content: string, cardNames?: string[]): string {
  return polishSpreadReadingText(
    content
      .replace(/\r\n/g, "\n")
      .replace(/^—\s/gm, "- ")
      .replace(/^~~~$/gm, "---"),
    cardNames
  );
}

function splitLeadingCardImages(content: string): { imageBlock: string; body: string } {
  const lines = content.split("\n");
  const imageLines: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";
    if (!line) {
      index += 1;
      continue;
    }
    if (CARD_IMAGE_RE.test(line)) {
      imageLines.push(line);
      index += 1;
      continue;
    }
    break;
  }

  return {
    imageBlock: imageLines.join("\n"),
    body: lines.slice(index).join("\n").trim(),
  };
}

function renderCardImageRow(markdown: string): ReactNode {
  const images = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
  if (!images.length) return null;

  return (
    <div className="my-6 flex flex-wrap justify-center gap-4">
      {images.map((match, i) => (
        <img
          key={`spread-card-${i}`}
          src={match[2]}
          alt={match[1] ?? "Карта расклада"}
          className="h-36 w-24 flex-shrink-0 rounded-md border border-amber-500/20 object-cover shadow-md"
          loading="lazy"
        />
      ))}
    </div>
  );
}

function renderInlineEmphasis(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-plain-${partIndex++}`}>
          {text.slice(lastIndex, match.index)}
        </Fragment>
      );
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong
          key={`${keyPrefix}-bold-${partIndex++}`}
          className="font-semibold text-mystic-gold"
        >
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em
          key={`${keyPrefix}-italic-${partIndex++}`}
          className="font-mystic-display italic text-mystic-lavender"
        >
          {token.slice(1, -1)}
        </em>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}-plain-${partIndex}`}>{text.slice(lastIndex)}</Fragment>
    );
  }

  return nodes.length ? nodes : [text];
}

/**
 * Within the markdown path, split run-on prose lines into blank-line-separated
 * paragraphs so react-markdown renders multiple <p> instead of one wall of text.
 * Structural lines (headings, lists, dividers, images, quotes) are left intact.
 */
function softenMarkdownParagraphs(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (/^(#{1,6}\s|-\s|\d+\.\s|---$|>\s|\|)/.test(t)) return line;
      if (CARD_IMAGE_RE.test(t)) return line;
      if (t.length < 240) return line;
      return splitWallOfText(t).join("\n\n");
    })
    .join("\n");
}

function renderPlainBody(text: string, className: string): ReactNode {
  const paragraphs = toParagraphs(text);
  return (
    <div className={`mystic-text space-y-4 font-body ${className}`}>
      {paragraphs.map((para, index) => {
        const lines = para.split("\n");
        return (
          <p
            key={`para-${index}`}
            className="text-[15px] leading-[1.85] tracking-[0.01em] text-mystic-text sm:text-base sm:leading-[1.9]"
          >
            {lines.map((line, lineIndex) => (
              <Fragment key={`para-${index}-line-${lineIndex}`}>
                {lineIndex > 0 && <br />}
                {renderInlineEmphasis(line, `para-${index}-line-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

const mysticMarkdownComponents: Components = {
  h2: ({ children }) => {
    const raw = String(children ?? "").replace(/^\s*✦\s*/, "").trim();
    const label = raw ? `✦ ${raw.toUpperCase()}` : "✦";
    return (
      <header className="my-5">
        <div
          className="mb-3 h-px w-full bg-gradient-to-r from-transparent via-mystic-gold/45 to-transparent"
          aria-hidden
        />
        <h3 className="font-mystic-display text-xl font-semibold uppercase tracking-[0.12em] text-mystic-gold">
          {label}
        </h3>
        <div
          className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-mystic-gold/45 to-transparent"
          aria-hidden
        />
      </header>
    );
  },
  h3: ({ children }) => {
    const raw = String(children ?? "").replace(/^\s*✦\s*/, "").trim();
    const label = raw ? `✦ ${raw.toUpperCase()}` : "✦";
    return (
      <header className="my-4">
        <h3 className="font-mystic-display text-lg font-semibold uppercase tracking-[0.1em] text-mystic-gold">
          {label}
        </h3>
      </header>
    );
  },
  p: ({ children, node }) => {
    const childNodes = node?.children ?? [];
    const onlyImages =
      childNodes.length > 0 &&
      childNodes.every(
        (child) => child.type === "element" && child.tagName === "img"
      );

    if (onlyImages) {
      return (
        <div className="my-6 flex flex-wrap justify-center gap-4">{children}</div>
      );
    }

    return <p className="text-base leading-[1.8] text-mystic-text">{children}</p>;
  },
  img: ({ src, alt }) => (
    <img
      src={typeof src === "string" ? src : ""}
      alt={alt ?? "Карта расклада"}
      className="h-36 w-24 flex-shrink-0 rounded-md border border-amber-500/20 object-cover shadow-md"
      loading="lazy"
    />
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-mystic-gold">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="font-mystic-display italic text-mystic-lavender">{children}</em>
  ),
  ul: ({ children }) => <ul className="my-2 space-y-2">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-2 pl-5">{children}</ol>,
  li: ({ children }) => (
    <li className="flex items-start gap-2.5 pl-1">
      <span className="mt-0.5 shrink-0 text-sm text-mystic-gold" aria-hidden>
        ✦
      </span>
      <span className="text-base leading-[1.8] text-mystic-text">{children}</span>
    </li>
  ),
  hr: () => (
    <div
      className="my-6 flex items-center justify-center gap-3"
      role="separator"
      aria-hidden
    >
      <span className="select-none text-xs tracking-[0.35em] text-mystic-gold/35">· · ·</span>
      <div className="h-px w-[80%] max-w-md bg-gradient-to-r from-transparent via-mystic-accent to-transparent" />
      <span className="select-none text-xs tracking-[0.35em] text-mystic-gold/35">· · ·</span>
    </div>
  ),
};

export default function ChatMessageRenderer({
  content,
  role = "assistant",
  className = "",
}: ChatMessageRendererProps) {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (role === "user") {
    return (
      <p className={`whitespace-pre-wrap break-words font-body text-sm leading-relaxed text-white ${className}`}>
        {trimmed}
      </p>
    );
  }

  const { imageBlock, body } = splitLeadingCardImages(trimmed);
  const cardNames = inferSpreadCardNames(imageBlock ? `${imageBlock}\n${body}` : trimmed);
  const markdownSource = normalizeMasterMarkdown(
    body || trimmed,
    cardNames.length ? cardNames : undefined
  );
  // Only route to react-markdown for BLOCK-level structure (headings, lists,
  // dividers, images). Replies with just inline **bold**/*italic* go through the
  // premium paragraph renderer, which handles inline emphasis AND breaks a
  // run-on block into readable paragraphs (react-markdown leaves it as one <p>).
  const hasBlockMarkdown = /(^#{1,2}\s|^-\s|^---$|^\d+\.\s|!\[[^\]]*\]\([^)]+\))/m.test(
    markdownSource
  );

  if (!hasBlockMarkdown && !imageBlock) {
    return renderPlainBody(markdownSource, className);
  }

  return (
    <div className={`mystic-text space-y-4 font-body ${className}`}>
      {imageBlock ? renderCardImageRow(imageBlock) : null}
      {markdownSource ? (
        <ReactMarkdown components={mysticMarkdownComponents}>
          {softenMarkdownParagraphs(markdownSource)}
        </ReactMarkdown>
      ) : null}
    </div>
  );
}
