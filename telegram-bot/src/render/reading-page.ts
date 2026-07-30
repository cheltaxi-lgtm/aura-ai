import sharp from "sharp";
import {
  BOT_CANVAS_HEIGHT,
  BOT_CANVAS_WIDTH,
  encodeBotJpeg,
  getOrnatePlate,
} from "./canvas.js";

/** @deprecated use BOT_CANVAS_WIDTH */
export const READING_PAGE_WIDTH = BOT_CANVAS_WIDTH;

/**
 * VPS has DejaVu, not Georgia — naming a missing font makes fontconfig crawl
 * on every <text> node and slows text pages a lot.
 */
const FONT = "DejaVu Serif, Georgia, 'Times New Roman', serif";

/** Inner padding — keep clear of the double gold frame. */
const PAD_X = 80;
const TEXT_TOP = 118;
const BOTTOM_RESERVE = 88;
/** DejaVu Serif Cyrillic average advance (wider than Latin). */
const CHAR_ADVANCE = 0.6;
const TITLE_GAP = 56; // title + divider + breathing room before body

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Collapse soft single newlines so mid-paragraph wraps don't create orphans. */
function normalizePlainForLayout(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/([^\n])\n(?!\n)/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Telegram HTML pages → plain text for the image canvas. */
export function htmlReadingToPlain(html: string): string {
  const raw = (html || "")
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return normalizePlainForLayout(raw);
}

function wrapLine(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    if (w.length <= maxChars) {
      cur = w;
    } else {
      for (let i = 0; i < w.length; i += maxChars) {
        const chunk = w.slice(i, i + maxChars);
        if (i + maxChars < w.length) lines.push(chunk);
        else cur = chunk;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function wrapParagraphs(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    out.push(...wrapLine(para, maxChars));
  }
  return out;
}

function linesHeight(lines: string[], lineH: number): number {
  return lines.reduce((h, line) => h + (line ? lineH : lineH * 0.4), 0);
}

export type TypeScale = {
  body: number;
  title: number;
  lineH: number;
  maxChars: number;
  maxLines: number;
  availH: number;
};

const TYPE_CANDIDATES: Array<Pick<TypeScale, "body" | "title" | "lineH">> = [
  { body: 40, title: 44, lineH: 58 },
  { body: 36, title: 40, lineH: 52 },
  { body: 32, title: 36, lineH: 46 },
  { body: 28, title: 34, lineH: 42 },
  { body: 26, title: 32, lineH: 38 },
];

function contentAvailH(hasTitle: boolean, titleSize: number): number {
  const titleBlock = hasTitle ? titleSize + TITLE_GAP : 0;
  return Math.max(120, BOT_CANVAS_HEIGHT - TEXT_TOP - BOTTOM_RESERVE - titleBlock);
}

function fillScale(
  base: Pick<TypeScale, "body" | "title" | "lineH">,
  hasTitle: boolean
): TypeScale {
  const availW = BOT_CANVAS_WIDTH - PAD_X * 2;
  const availH = contentAvailH(hasTitle, base.title);
  return {
    ...base,
    maxChars: Math.max(20, Math.floor(availW / (base.body * CHAR_ADVANCE))),
    maxLines: Math.max(4, Math.floor(availH / base.lineH)),
    availH,
  };
}

function bodyFits(scale: TypeScale, body: string): boolean {
  const lines = wrapParagraphs(body, scale.maxChars);
  return linesHeight(lines, scale.lineH) <= scale.availH + 0.5;
}

/** Pick the largest readable type that still fits the canvas (title reserved). */
function pickTypeScale(body: string, hasTitle: boolean): TypeScale {
  for (const c of TYPE_CANDIDATES) {
    const scale = fillScale(c, hasTitle);
    if (bodyFits(scale, body)) return scale;
  }
  return fillScale(TYPE_CANDIDATES[TYPE_CANDIDATES.length - 1]!, hasTitle);
}

function splitTitle(plain: string): { title: string | null; body: string } {
  const parts = plain.split(/\n+/);
  const first = (parts[0] || "").trim();
  const rest = parts.slice(1).join("\n").trim();
  if (
    first &&
    first.length <= 48 &&
    (first.startsWith("✦") ||
      first.startsWith("•") ||
      (/^[А-ЯЁA-Z]/.test(first) && first.length <= 36 && rest.length > 40))
  ) {
    return { title: first.replace(/^✦\s*/, "").trim(), body: rest || plain };
  }
  return { title: null, body: plain };
}

/** True when the whole plain page paints without ellipsis clipping. */
export function readingPlainFitsCanvas(plain: string): boolean {
  const text = (plain || "").trim() || "—";
  const { title, body } = splitTitle(text);
  const scale = pickTypeScale(body || text, Boolean(title));
  return bodyFits(scale, body || text);
}

/**
 * Split plain reading text into pages that fit 1080×1350 at a comfortable
 * type size (≈32px). Render may still upscale short pages; it must never need
 * hard "…" truncation.
 */
export function paginatePlainForReadingCanvas(plain: string): string[] {
  const text = (plain || "").trim();
  if (!text) return [];

  // Prefer readable type: body 32. Only keep as one page if it fits that budget
  // (or larger via pickTypeScale at paint time for short pages).
  const targetIdx = 2; // { body: 32, title: 36, lineH: 46 }
  const targetBase = TYPE_CANDIDATES[targetIdx]!;
  const { title, body } = splitTitle(text);
  const source = (body || text).trim();

  const probe = fillScale(targetBase, Boolean(title));
  if (bodyFits(probe, source) && readingPlainFitsCanvas(text)) {
    return [text];
  }

  const packWithTitle = fillScale(targetBase, true);
  const packNoTitle = fillScale(targetBase, false);
  // Wrap at with-title width so lines never overflow when the first page has a title.
  const maxChars = Math.min(packWithTitle.maxChars, packNoTitle.maxChars);
  const lines = wrapParagraphs(source, maxChars);

  const pages: string[] = [];
  let i = 0;
  let pageIdx = 0;

  while (i < lines.length) {
    const useTitle = pageIdx === 0 && Boolean(title);
    const scale = useTitle ? packWithTitle : packNoTitle;
    let used = 0;
    const chunk: string[] = [];

    while (i < lines.length) {
      const line = lines[i]!;
      const cost = line ? scale.lineH : scale.lineH * 0.4;
      if (chunk.length > 0 && used + cost > scale.availH + 0.5) break;
      chunk.push(line);
      used += cost;
      i += 1;
    }

    // Prefer ending a page on a paragraph break (blank line) when we still
    // have more content — avoids mid-sentence cutoffs at the page edge.
    if (i < lines.length && chunk.length > 4) {
      let cut = -1;
      for (let j = chunk.length - 1; j >= Math.floor(chunk.length * 0.45); j--) {
        if (!chunk[j]!.trim()) {
          cut = j;
          break;
        }
      }
      if (cut > 0) {
        // Rewind stream to the blank; next page starts after it.
        i -= chunk.length - cut;
        chunk.length = cut;
      }
    }

    while (chunk.length && !chunk[0]!.trim()) chunk.shift();
    while (chunk.length && !chunk[chunk.length - 1]!.trim()) chunk.pop();

    if (!chunk.length) {
      if (i < lines.length) {
        pages.push(lines[i]!);
        i += 1;
        pageIdx += 1;
      }
      continue;
    }

    const bodyText = chunk.join("\n").trim();
    pages.push(useTitle && title ? `${title}\n\n${bodyText}` : bodyText);
    pageIdx += 1;
  }

  return pages.length ? pages : [text];
}

/**
 * Expand section HTML pages so each photo page fits a comfortable type size.
 * Keeps original HTML only when it already fits the target budget.
 */
export function expandReadingPagesForCanvas(messages: string[]): string[] {
  const out: string[] = [];
  for (const msg of messages) {
    const plain = htmlReadingToPlain(msg);
    if (!plain) continue;
    const parts = paginatePlainForReadingCanvas(plain);
    if (parts.length <= 1) {
      out.push(msg);
      continue;
    }
    out.push(...parts);
  }
  return out;
}

/**
 * Premium reading page — adaptive type + ornate frame on fixed 1080×1350 canvas.
 * Frame plate is cached; only the text overlay is rasterized per page.
 */
export async function renderReadingPageImage(opts: {
  bodyHtmlOrText: string;
  page: number;
  total: number;
  footer?: string;
  brand?: string;
}): Promise<Buffer> {
  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;

  let plain = htmlReadingToPlain(opts.bodyHtmlOrText);
  if (!plain) plain = "—";
  if (opts.footer?.trim()) {
    plain = `${plain}\n\n${opts.footer.trim()}`;
  }

  const { title, body } = splitTitle(plain);
  const bodyText = body || plain;
  const hasTitle = Boolean(title);
  const scale = pickTypeScale(bodyText, hasTitle);
  const bodyLines = wrapParagraphs(bodyText, scale.maxChars);

  // Safety net only — pagination should prevent this path.
  let drawLines = bodyLines;
  if (linesHeight(bodyLines, scale.lineH) > scale.availH + 0.5) {
    const keep: string[] = [];
    let used = 0;
    for (const line of bodyLines) {
      const cost = line ? scale.lineH : scale.lineH * 0.4;
      if (keep.length && used + cost > scale.availH - scale.lineH) break;
      keep.push(line);
      used += cost;
    }
    if (keep.length < bodyLines.length) {
      while (keep.length && !keep[keep.length - 1]!.trim()) keep.pop();
      keep.push("…");
      console.warn(
        `[reading-page] clipped page ${opts.page + 1}/${opts.total} ` +
          `(${bodyLines.length} lines → ${keep.length})`
      );
    }
    drawLines = keep;
  }

  const pageLabel = `${opts.page + 1} / ${Math.max(1, opts.total)}`;
  const titleSize = title ? Math.max(scale.title, scale.body + 4) : 0;
  const contentH =
    (title ? titleSize + TITLE_GAP : 0) + linesHeight(drawLines, scale.lineH);

  const blockTop = Math.max(
    TEXT_TOP,
    Math.floor((height - BOTTOM_RESERVE - contentH) / 2 + (title ? 8 : 28))
  );

  let y = blockTop;
  const chunks: string[] = [];

  if (title) {
    // Keep title clearly above body (never smaller than body).
    chunks.push(
      `<text x="50%" y="${y}" text-anchor="middle"
        font-family="${FONT}" font-size="${titleSize}"
        fill="#E8D5A8">${escapeXml(title)}</text>`
    );
    y += titleSize + 20;
    chunks.push(
      `<line x1="${width * 0.32}" y1="${y}" x2="${width * 0.72}" y2="${y}"
        stroke="#C4A574" stroke-opacity="0.45" stroke-width="1.5"/>`
    );
    y += 36;
  }

  // One <text> + <tspan>s — much cheaper for librsvg than N separate <text> nodes.
  const tspans: string[] = [];
  let firstBody = true;
  let pendingDy = 0;
  for (const line of drawLines) {
    if (!line) {
      const gap = scale.lineH * 0.4;
      y += gap;
      if (!firstBody) pendingDy += gap;
      continue;
    }
    if (firstBody) {
      tspans.push(`<tspan x="${PAD_X}" y="${y}">${escapeXml(line)}</tspan>`);
      firstBody = false;
      pendingDy = 0;
    } else {
      const dy = scale.lineH + pendingDy;
      pendingDy = 0;
      tspans.push(`<tspan x="${PAD_X}" dy="${dy}">${escapeXml(line)}</tspan>`);
    }
    y += scale.lineH;
  }
  if (tspans.length) {
    chunks.push(
      `<text font-family="${FONT}" font-size="${scale.body}" fill="#F5EDE3">${tspans.join(
        ""
      )}</text>`
    );
  }

  chunks.push(
    `<text x="50%" y="${height - 52}" text-anchor="middle"
      font-family="${FONT}" font-size="20" letter-spacing="3" fill="#A89068">${escapeXml(pageLabel)}</text>`
  );

  const overlaySvg = Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="textClip">
          <rect x="${PAD_X - 4}" y="${TEXT_TOP - 24}" width="${width - (PAD_X - 4) * 2}" height="${
            height - TEXT_TOP - BOTTOM_RESERVE + 36
          }" rx="2"/>
        </clipPath>
      </defs>
      <g clip-path="url(#textClip)">
        ${chunks.slice(0, -1).join("\n")}
      </g>
      ${chunks[chunks.length - 1]}
    </svg>`
  );

  const plate = await getOrnatePlate();
  return encodeBotJpeg(sharp(plate).composite([{ input: overlaySvg }]));
}
