import sharp from "sharp";
import { botConfig } from "../config.js";
import { resolveAssetPath } from "../domain/deck/asset-check.js";
import { FULL_DECK } from "../domain/deck/cards.js";
import {
  BOT_CANVAS_HEIGHT,
  BOT_CANVAS_WIDTH,
  encodeBotJpeg,
  getOrnatePlate,
} from "./canvas.js";

const FONT = "DejaVu Serif, Georgia, 'Times New Roman', serif";
/** Match collage / photo-rasklad cap. */
const MAX_HISTORY_CARDS = 12;
const CARD_ASPECT = 2 / 3;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type HistoryEntryKind = "matrix" | "photo" | "spread";

function kindLabel(kind: HistoryEntryKind): string {
  if (kind === "matrix") return "МАТРИЦА СУДЬБЫ";
  if (kind === "photo") return "РАСКЛАД ПО ФОТО";
  return "РАСКЛАД";
}

function formatDate(iso: string): string {
  const d = (iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || "";
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
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
    cur = w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Short teaser for phone — first sentence or hard clip. */
function shortPreview(raw: string, maxLen: number): string {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const sentence = t.match(/^(.{20,}?[.!?…])(?:\s|$)/)?.[1];
  const base = (sentence && sentence.length <= maxLen + 40 ? sentence : t).trim();
  if (base.length <= maxLen) return base;
  return `${base.slice(0, maxLen - 1).replace(/\s+\S*$/, "").trim()}…`;
}

function resolveSlug(name: string): string | null {
  const n = name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\(перев[^)]*\)|\(rev(?:ersed)?\.?\)|перевёрнут[аы]?|перевернут[аы]?/gi, "")
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return null;
  const hit =
    FULL_DECK.find((c) => c.name.toLowerCase() === n) ||
    FULL_DECK.find((c) => {
      const cn = c.name.toLowerCase();
      return cn.includes(n) || n.includes(cn);
    });
  return hit?.slug ?? null;
}

function gridLayout(n: number): { cols: number; rows: number } {
  const count = Math.max(1, Math.min(MAX_HISTORY_CARDS, n));
  if (count <= 3) return { cols: count, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: Math.ceil(count / 4) };
}

type ThumbGrid = {
  cols: number;
  rows: number;
  thumbW: number;
  thumbH: number;
  gap: number;
  gridW: number;
  gridH: number;
};

function computeThumbGrid(cardCount: number, maxW: number, maxH: number): ThumbGrid {
  const n = Math.max(1, Math.min(MAX_HISTORY_CARDS, cardCount));
  const { cols, rows } = gridLayout(n);
  const gap = n >= 7 ? 14 : n >= 4 ? 18 : 24;
  const thumbW = Math.floor((maxW - gap * (cols - 1)) / cols);
  const thumbH = Math.round(thumbW / CARD_ASPECT);
  const gridW = cols * thumbW + (cols - 1) * gap;
  let gridH = rows * thumbH + (rows - 1) * gap;
  if (gridH > maxH) {
    const scale = maxH / gridH;
    const tw = Math.max(72, Math.floor(thumbW * scale));
    const th = Math.round(tw / CARD_ASPECT);
    return {
      cols,
      rows,
      thumbW: tw,
      thumbH: th,
      gap,
      gridW: cols * tw + (cols - 1) * gap,
      gridH: rows * th + (rows - 1) * gap,
    };
  }
  return { cols, rows, thumbW, thumbH, gap, gridW, gridH };
}

type Scale = {
  kind: number;
  title: number;
  titleLine: number;
  date: number;
  body: number;
  bodyLine: number;
  maxChars: number;
  maxPreviewLines: number;
};

function pickScale(opts: {
  topic: string;
  preview: string;
  cardCount: number;
  gridH: number;
}): Scale {
  const availH = BOT_CANVAS_HEIGHT - 260;
  const availW = BOT_CANVAS_WIDTH - 140;
  const candidates: Scale[] = [
    { kind: 22, title: 52, titleLine: 62, date: 28, body: 36, bodyLine: 50, maxChars: 0, maxPreviewLines: 3 },
    { kind: 20, title: 46, titleLine: 56, date: 26, body: 32, bodyLine: 44, maxChars: 0, maxPreviewLines: 4 },
    { kind: 18, title: 40, titleLine: 50, date: 24, body: 28, bodyLine: 40, maxChars: 0, maxPreviewLines: 4 },
    { kind: 18, title: 36, titleLine: 44, date: 22, body: 26, bodyLine: 36, maxChars: 0, maxPreviewLines: 3 },
  ];

  for (const c of candidates) {
    c.maxChars = Math.max(16, Math.floor(availW / (c.body * 0.55)));
    const topicLines = wrapLine(opts.topic, Math.max(14, Math.floor(availW / (c.title * 0.55))));
    const previewLines = wrapLine(opts.preview, c.maxChars).slice(0, c.maxPreviewLines);
    let used =
      c.kind + 28 +
      topicLines.length * c.titleLine +
      c.date + 24 +
      28;
    if (opts.cardCount > 0) {
      used += opts.gridH + 36;
    }
    if (previewLines.length) {
      used += previewLines.length * c.bodyLine + 16;
    }
    if (used <= availH) return c;
  }
  return candidates[candidates.length - 1]!;
}

async function loadCardThumbs(
  cardNames: string[],
  w: number,
  h: number
): Promise<Buffer[]> {
  const names = cardNames.filter(Boolean).slice(0, MAX_HISTORY_CARDS);
  const bufs = await Promise.all(
    names.map(async (name) => {
      const slug = resolveSlug(name);
      const path = slug ? resolveAssetPath(botConfig.deckAssetsDir, slug) : null;
      if (!path) return null;
      try {
        return await sharp(path)
          .resize(w, h, { fit: "cover", position: "centre" })
          .jpeg({ quality: 82, mozjpeg: false })
          .toBuffer();
      } catch {
        return null;
      }
    })
  );
  return bufs.filter((b): b is Buffer => Boolean(b));
}

/**
 * Premium history album page — large adaptive type + up to 12 card faces.
 */
export async function renderHistoryEntryImage(opts: {
  kind: HistoryEntryKind;
  topic: string;
  date: string;
  preview?: string;
  cards?: string[];
  page: number;
  total: number;
}): Promise<Buffer> {
  const width = BOT_CANVAS_WIDTH;
  const height = BOT_CANVAS_HEIGHT;
  const topic = (opts.topic || "Сеанс").trim().slice(0, 64);
  const preview = shortPreview(opts.preview || "", opts.kind === "matrix" ? 160 : 120);
  const dateLabel = formatDate(opts.date);
  const pageLabel = `${opts.page + 1} / ${Math.max(1, opts.total)}`;
  const cardNames = (opts.cards || []).filter(Boolean).slice(0, MAX_HISTORY_CARDS);
  const showThumbs = opts.kind !== "matrix" && cardNames.length > 0;

  // Reserve room for header/footer; cards get the middle band.
  const gridBudgetH = showThumbs
    ? Math.floor(height * (cardNames.length <= 3 ? 0.42 : cardNames.length <= 6 ? 0.48 : 0.52))
    : 0;
  const grid = showThumbs
    ? computeThumbGrid(cardNames.length, width - 120, gridBudgetH)
    : { cols: 0, rows: 0, thumbW: 0, thumbH: 0, gap: 0, gridW: 0, gridH: 0 };

  const scale = pickScale({
    topic,
    preview,
    cardCount: showThumbs ? cardNames.length : 0,
    gridH: grid.gridH,
  });

  const thumbs = showThumbs
    ? await loadCardThumbs(cardNames, grid.thumbW, grid.thumbH)
    : [];

  const topicChars = Math.max(14, Math.floor((width - 140) / (scale.title * 0.55)));
  const topicLines = wrapLine(topic, topicChars).slice(0, 3);
  const previewLines = wrapLine(preview, scale.maxChars).slice(
    0,
    thumbs.length >= 7 ? 2 : scale.maxPreviewLines
  );

  let blockH =
    scale.kind + 36 +
    topicLines.length * scale.titleLine +
    (dateLabel ? scale.date + 18 : 0) +
    32;
  if (thumbs.length) {
    blockH += grid.gridH + 36;
  } else if (cardNames.length) {
    blockH += Math.min(cardNames.length, 8) * Math.round(scale.bodyLine * 0.85) + 16;
  }
  if (previewLines.length) {
    blockH += previewLines.length * scale.bodyLine + 12;
  }

  const topPad = 110;
  const bottomPad = 90;
  const avail = height - topPad - bottomPad;
  let y = topPad + Math.max(0, Math.floor((avail - blockH) / 2));

  const nodes: string[] = [];

  nodes.push(
    `<text x="50%" y="${y}" text-anchor="middle"
      font-family="${FONT}" font-size="${scale.kind}" letter-spacing="6" fill="#C4A574">${escapeXml(
      kindLabel(opts.kind)
    )}</text>`
  );
  y += scale.kind + 36;

  for (const line of topicLines) {
    nodes.push(
      `<text x="50%" y="${y}" text-anchor="middle"
        font-family="${FONT}" font-size="${scale.title}" fill="#F5EDE3">${escapeXml(line)}</text>`
    );
    y += scale.titleLine;
  }

  if (dateLabel) {
    nodes.push(
      `<text x="50%" y="${y}" text-anchor="middle"
        font-family="${FONT}" font-size="${scale.date}" fill="#A89068">${escapeXml(dateLabel)}</text>`
    );
    y += scale.date + 18;
  }

  nodes.push(
    `<line x1="${width * 0.22}" y1="${y}" x2="${width * 0.78}" y2="${y}"
      stroke="#C4A574" stroke-opacity="0.5" stroke-width="2"/>`
  );
  y += 28;

  const gridLeft = Math.floor((width - grid.gridW) / 2);
  const gridTop = thumbs.length ? y : 0;

  if (thumbs.length) {
    for (let i = 0; i < thumbs.length; i++) {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      const left = gridLeft + col * (grid.thumbW + grid.gap);
      const top = gridTop + row * (grid.thumbH + grid.gap);
      nodes.push(
        `<rect x="${left - 3}" y="${top - 3}" width="${grid.thumbW + 6}" height="${grid.thumbH + 6}"
          fill="none" stroke="#C4A574" stroke-opacity="0.7" stroke-width="2" rx="4"/>`
      );
    }
    y = gridTop + grid.gridH + 32;
  } else if (cardNames.length) {
    for (const name of cardNames.slice(0, 8)) {
      nodes.push(
        `<text x="50%" y="${y}" text-anchor="middle"
          font-family="${FONT}" font-size="${Math.round(scale.body * 0.85)}" fill="#E8D5A8">${escapeXml(
          name
        )}</text>`
      );
      y += Math.round(scale.bodyLine * 0.85);
    }
    y += 12;
  }

  if (previewLines.length) {
    const tspans = previewLines
      .map((line, i) =>
        i === 0
          ? `<tspan x="50%" y="${y}" text-anchor="middle">${escapeXml(line)}</tspan>`
          : `<tspan x="50%" dy="${scale.bodyLine}" text-anchor="middle">${escapeXml(line)}</tspan>`
      )
      .join("");
    nodes.push(
      `<text font-family="${FONT}" font-size="${scale.body}" fill="#F5EDE3">${tspans}</text>`
    );
  }

  nodes.push(
    `<text x="50%" y="${height - 48}" text-anchor="middle"
      font-family="${FONT}" font-size="24" letter-spacing="4" fill="#A89068">${escapeXml(
      pageLabel
    )}</text>`
  );

  const overlaySvg = Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${nodes.join("\n")}
    </svg>`
  );

  const plate = await getOrnatePlate();
  const composites: sharp.OverlayOptions[] = thumbs.map((input, i) => {
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    return {
      input,
      left: gridLeft + col * (grid.thumbW + grid.gap),
      top: gridTop + row * (grid.thumbH + grid.gap),
    };
  });
  composites.push({ input: overlaySvg });

  return encodeBotJpeg(sharp(plate).composite(composites));
}
