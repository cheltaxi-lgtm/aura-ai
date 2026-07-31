"use client";

import { Fragment, memo, useMemo, type ReactNode } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { toParagraphs, splitWallOfText } from "@/lib/format-paragraphs";
import { formatPremiumReadingForDisplay } from "@/lib/format-premium-reading";
import {
  inferSpreadCardNames,
  polishSpreadReadingText,
  stripAllSpreadCardImages,
} from "@/lib/reading-text-polish";

export type ReadingRenderVariant = "mystic" | "print";

export interface ChatMessageRendererProps {
  content: string;
  role?: "user" | "assistant";
  className?: string;
  /** When the spread header already shows cards, hide duplicate card images in the message body. */
  hideSpreadCardImages?: boolean;
  /** mystic = chat/gold UI; print = black typography for print/PDF pages. */
  variant?: ReadingRenderVariant;
}

const CARD_IMAGE_RE = /^!\[([^\]]*)\]\(([^)]*)\)\s*$/;

/** Normalize master prose into structured markdown for react-markdown. */
function normalizeMasterMarkdown(content: string, cardNames?: string[]): string {
  const structured = formatPremiumReadingForDisplay(content);
  return polishSpreadReadingText(
    structured
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
  const images = [...markdown.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)].filter(
    (match) => Boolean(match[2]?.trim())
  );
  if (!images.length) return null;

  return (
    <div className="my-6 flex flex-wrap justify-center gap-4">
      {images.map((match, i) => (
        <Image
          key={`spread-card-${i}`}
          src={match[2]!.trim()}
          alt={match[1] ?? "Карта расклада"}
          width={96}
          height={144}
          className="h-36 w-24 flex-shrink-0 rounded-md border border-amber-500/20 object-cover shadow-md"
          loading="lazy"
        />
      ))}
    </div>
  );
}

function renderInlineEmphasis(
  text: string,
  keyPrefix: string,
  variant: ReadingRenderVariant
): ReactNode[] {
  const boldClass =
    variant === "print" ? "font-semibold text-black" : "font-semibold text-mystic-gold";
  const italicClass =
    variant === "print"
      ? "font-mystic-display italic text-black/70"
      : "font-mystic-display italic text-mystic-lavender";
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
        <strong key={`${keyPrefix}-bold-${partIndex++}`} className={boldClass}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em key={`${keyPrefix}-italic-${partIndex++}`} className={italicClass}>
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

function renderPlainBody(
  text: string,
  className: string,
  variant: ReadingRenderVariant
): ReactNode {
  const paragraphs = toParagraphs(text);
  const paraClass =
    variant === "print"
      ? "text-[15px] leading-[1.85] tracking-[0.01em] text-black sm:text-base sm:leading-[1.9]"
      : "text-[15px] leading-[1.85] tracking-[0.01em] text-mystic-text sm:text-base sm:leading-[1.9]";
  return (
    <div className={`mystic-text space-y-4 font-body ${className}`}>
      {paragraphs.map((para, index) => {
        const lines = para.split("\n");
        return (
          <p key={`para-${index}`} className={paraClass}>
            {lines.map((line, lineIndex) => (
              <Fragment key={`para-${index}-line-${lineIndex}`}>
                {lineIndex > 0 && <br />}
                {renderInlineEmphasis(line, `para-${index}-line-${lineIndex}`, variant)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function buildMarkdownComponents(variant: ReadingRenderVariant): Components {
  const isPrint = variant === "print";
  const bodyClass = isPrint
    ? "text-[15px] leading-[1.85] tracking-[0.01em] text-black sm:text-base sm:leading-[1.9]"
    : "text-[15px] leading-[1.85] tracking-[0.01em] text-mystic-text sm:text-base sm:leading-[1.9]";

  return {
    h2: ({ children }) => {
      const raw = String(children ?? "").replace(/^\s*✦\s*/, "").trim();
      if (isPrint) {
        return (
          <header className="mb-3 mt-7 border-b border-black/15 pb-2 first:mt-0">
            <h3 className="font-mystic-display text-xl font-semibold tracking-[0.04em] text-black">
              {raw}
            </h3>
          </header>
        );
      }
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
      if (isPrint) {
        return (
          <header className="mb-2 mt-5 first:mt-0">
            <h3 className="font-mystic-display text-lg font-semibold text-black">{raw}</h3>
          </header>
        );
      }
      return (
        <header className="mb-2 mt-6 first:mt-0">
          <h3 className="font-mystic-display text-[1.05rem] font-semibold leading-snug tracking-[0.04em] text-mystic-gold sm:text-lg">
            {raw}
          </h3>
          <div
            className="mt-2 h-px w-16 bg-gradient-to-r from-mystic-gold/55 to-transparent"
            aria-hidden
          />
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

      return <p className={bodyClass}>{children}</p>;
    },
    img: ({ src, alt }) =>
      typeof src === "string" && src ? (
        <Image
          src={src}
          alt={alt ?? "Карта расклада"}
          width={96}
          height={144}
          className="h-36 w-24 flex-shrink-0 rounded-md border border-amber-500/20 object-cover shadow-md"
          loading="lazy"
        />
      ) : null,
    strong: ({ children }) => (
      <strong className={isPrint ? "font-semibold text-black" : "font-semibold text-mystic-gold"}>
        {children}
      </strong>
    ),
    em: ({ children }) => (
      <em
        className={
          isPrint
            ? "font-mystic-display italic text-black/70"
            : "font-mystic-display italic text-mystic-lavender"
        }
      >
        {children}
      </em>
    ),
    ul: ({ children }) =>
      isPrint ? (
        <ul className="my-3 list-disc space-y-2.5 pl-5 marker:text-black/55">{children}</ul>
      ) : (
        <ul className="my-3 list-none space-y-2.5 [&_li]:relative [&_li]:pl-6 [&_li]:before:absolute [&_li]:before:left-0 [&_li]:before:top-0.5 [&_li]:before:text-sm [&_li]:before:text-mystic-gold [&_li]:before:content-['✦']">
          {children}
        </ul>
      ),
    ol: ({ children }) => (
      <ol
        className={
          isPrint
            ? "my-3 list-decimal space-y-3 pl-6 marker:font-semibold marker:text-black"
            : "my-3 list-decimal space-y-3 pl-6 marker:font-mystic-display marker:font-semibold marker:text-mystic-gold"
        }
      >
        {children}
      </ol>
    ),
    li: ({ children }) => <li className={bodyClass}>{children}</li>,
    hr: () =>
      isPrint ? (
        <hr className="my-6 border-black/15" />
      ) : (
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
}

function ChatMessageRenderer({
  content,
  role = "assistant",
  className = "",
  hideSpreadCardImages = false,
  variant = "mystic",
}: ChatMessageRendererProps) {
  const trimmed = (hideSpreadCardImages ? stripAllSpreadCardImages(content) : content).trim();
  const isUser = role === "user";

  const { imageBlock, body } = useMemo(
    () => (trimmed && !isUser ? splitLeadingCardImages(trimmed) : { imageBlock: "", body: "" }),
    [trimmed, isUser]
  );
  const cardNamesKey = useMemo(() => {
    if (!trimmed || isUser || hideSpreadCardImages) return "";
    return inferSpreadCardNames(imageBlock ? `${imageBlock}\n${body}` : trimmed).join("\0");
  }, [trimmed, isUser, hideSpreadCardImages, imageBlock, body]);
  const markdownSource = useMemo(() => {
    if (!trimmed || isUser) return "";
    const names = cardNamesKey ? cardNamesKey.split("\0") : undefined;
    return normalizeMasterMarkdown(body || trimmed, names);
  }, [trimmed, isUser, body, cardNamesKey]);

  if (!trimmed) return null;

  if (isUser) {
    return (
      <p className={`whitespace-pre-wrap break-words font-body text-sm leading-relaxed text-white ${className}`}>
        {trimmed}
      </p>
    );
  }

  const hasBlockMarkdown = /(^#{1,3}\s|^-\s|^---$|^\d+\.\s|!\[[^\]]*\]\([^)]+\))/m.test(
    markdownSource
  );

  if (!hasBlockMarkdown && !imageBlock) {
    return renderPlainBody(markdownSource, className, variant);
  }

  return (
    <div className={`mystic-text space-y-4 font-body ${className}`}>
      {!hideSpreadCardImages && imageBlock ? renderCardImageRow(imageBlock) : null}
      {markdownSource ? (
        <ReactMarkdown components={buildMarkdownComponents(variant)}>
          {softenMarkdownParagraphs(markdownSource)}
        </ReactMarkdown>
      ) : null}
    </div>
  );
}

export default memo(ChatMessageRenderer);
