"use client";

import { Fragment, type ReactNode } from "react";

export interface MysticTextProps {
  content: string;
  className?: string;
}

type MysticBlock =
  | { type: "heading"; text: string }
  | { type: "divider" }
  | { type: "list"; text: string }
  | { type: "paragraph"; lines: string[] };

function parseBlocks(content: string): MysticBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MysticBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push({ type: "paragraph", lines: [...paragraphLines] });
    paragraphLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    if (/^##\s+/.test(line)) {
      flushParagraph();
      blocks.push({ type: "heading", text: line.replace(/^##\s+/, "").trim() });
      continue;
    }

    if (/^(~~~|---)$/.test(line)) {
      flushParagraph();
      blocks.push({ type: "divider" });
      continue;
    }

    if (/^—\s/.test(line)) {
      flushParagraph();
      blocks.push({ type: "list", text: line.replace(/^—\s*/, "").trim() });
      continue;
    }

    if (/^-\s/.test(line) && !/^-\s*-/.test(line)) {
      flushParagraph();
      blocks.push({ type: "list", text: line.replace(/^-\s*/, "").trim() });
      continue;
    }

    paragraphLines.push(rawLine.trimEnd());
  }

  flushParagraph();
  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
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
          className="font-semibold text-aura-gold"
        >
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em
          key={`${keyPrefix}-italic-${partIndex++}`}
          className="font-mystic-display italic text-aura-champagne"
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

function MysticHeading({ text }: { text: string }) {
  const normalized = text.replace(/^\s*✦\s*/, "").trim();
  const label = normalized ? `✦ ${normalized.toUpperCase()}` : "✦";

  return (
    <header className="my-5">
      <div
        className="mb-3 h-px w-full bg-gradient-to-r from-transparent via-aura-gold/45 to-transparent"
        aria-hidden
      />
      <h3 className="font-mystic-display text-xl font-semibold uppercase tracking-[0.12em] text-aura-gold">
        {label}
      </h3>
      <div
        className="mt-3 h-px w-full bg-gradient-to-r from-transparent via-aura-gold/45 to-transparent"
        aria-hidden
      />
    </header>
  );
}

function MysticDivider() {
  return (
    <div
      className="my-6 flex items-center justify-center gap-3"
      role="separator"
      aria-hidden
    >
      <span className="select-none text-xs tracking-[0.35em] text-aura-gold/35">· · ·</span>
      <div className="h-px w-[80%] max-w-md bg-gradient-to-r from-transparent via-aura-gold to-transparent" />
      <span className="select-none text-xs tracking-[0.35em] text-aura-gold/35">· · ·</span>
    </div>
  );
}

function MysticListItem({ text, index }: { text: string; index: number }) {
  return (
    <div className="flex items-start gap-2.5 pl-1">
      <span className="mt-0.5 shrink-0 text-sm text-aura-gold" aria-hidden>
        ✦
      </span>
      <p className="text-base leading-[1.8] text-aura-ivory">
        {renderInline(text, `list-${index}`)}
      </p>
    </div>
  );
}

function MysticParagraph({ lines, index }: { lines: string[]; index: number }) {
  return (
    <p className="text-base leading-[1.8] text-aura-ivory">
      {lines.map((line, lineIndex) => (
        <Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {renderInline(line, `para-${index}-${lineIndex}`)}
        </Fragment>
      ))}
    </p>
  );
}

export default function MysticText({ content, className = "" }: MysticTextProps) {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const blocks = parseBlocks(trimmed);

  if (blocks.length === 0) {
    return (
      <div className={`font-body text-base leading-[1.8] text-aura-ivory ${className}`}>
        {content}
      </div>
    );
  }

  return (
      <div className={`space-y-3 font-body ${className}`}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return <MysticHeading key={`h-${index}`} text={block.text} />;
          case "divider":
            return <MysticDivider key={`d-${index}`} />;
          case "list":
            return <MysticListItem key={`l-${index}`} text={block.text} index={index} />;
          case "paragraph":
            return (
              <MysticParagraph key={`p-${index}`} lines={block.lines} index={index} />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
