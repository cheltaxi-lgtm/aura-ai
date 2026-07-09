import { BRAND_NAME, getAppUrl } from "@/lib/brand";
import type { ShareChannel, ShareKind } from "./types";

export function buildSharePageUrl(token: string, channel?: ShareChannel): string {
  const base = getAppUrl();
  const url = `${base}/share/${encodeURIComponent(token)}`;
  if (!channel) return url;
  const params = new URLSearchParams({
    utm_source: "share",
    utm_medium: channel,
  });
  return `${url}?${params.toString()}`;
}

export interface ShareMessageInput {
  title: string;
  masterName?: string;
  excerpt?: string;
  kind?: ShareKind;
  cards?: string[];
  date?: string;
}

export type SharePreviewBlock =
  | { type: "eyebrow"; text: string }
  | { type: "master"; name: string }
  | { type: "topic"; question: string }
  | { type: "title"; text: string }
  | { type: "insight"; text: string }
  | { type: "symbols"; names: string }
  | { type: "date"; text: string };

export function truncateAtWord(text: string, maxLen: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLen) return trimmed;
  const slice = trimmed.slice(0, maxLen - 1);
  const breakAt = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("—"), slice.lastIndexOf("–"));
  const cut = breakAt > maxLen * 0.55 ? slice.slice(0, breakAt) : slice;
  return `${cut.trim()}…`;
}

function firstReadableExcerpt(excerpt: string, maxLen = 120): string | null {
  const plain = excerpt.trim().replace(/\s+/g, " ");
  if (!plain) return null;
  const sentenceMatch = plain.match(/^[^.!?…]+[.!?…]/);
  const candidate = sentenceMatch ? sentenceMatch[0].trim() : plain;
  return truncateAtWord(candidate, maxLen);
}

function shareKindLabel(kind?: ShareKind): string {
  switch (kind) {
    case "session":
      return "Сеанс";
    case "daily":
      return "Энергия дня";
    case "triplet":
      return "Три карты";
    case "ritual":
      return "Ритуал";
    case "joint":
      return "Совместный расклад";
    default:
      return "Расклад";
  }
}

function isUserTopicTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  if (t.length > 72) return true;
  if (/[.!?]\s+\S/.test(t)) return true;
  if (t.split(",").length >= 2) return true;
  return false;
}

function normalizeShareMessageInput(
  titleOrInput: string | ShareMessageInput,
  masterName?: string
): ShareMessageInput {
  if (typeof titleOrInput === "string") {
    return { title: titleOrInput, masterName };
  }
  return titleOrInput;
}

/** Структурированные блоки для премиального превью в UI. */
export function buildSharePreviewBlocks(
  titleOrInput: string | ShareMessageInput,
  masterName?: string
): SharePreviewBlock[] {
  const input = normalizeShareMessageInput(titleOrInput, masterName);
  const blocks: SharePreviewBlock[] = [
    { type: "eyebrow", text: `${BRAND_NAME} · ${shareKindLabel(input.kind).toLowerCase()}` },
  ];

  if (input.masterName?.trim()) {
    blocks.push({ type: "master", name: input.masterName.trim() });
  }

  if (input.date?.trim()) {
    blocks.push({ type: "date", text: input.date.trim() });
  }

  const title = input.title.trim();
  if (title) {
    if (isUserTopicTitle(title)) {
      blocks.push({ type: "topic", question: truncateAtWord(title, 100) });
    } else {
      blocks.push({ type: "title", text: title });
    }
  }

  const symbols = input.cards?.filter(Boolean).slice(0, 4).join(" · ");
  if (symbols) {
    blocks.push({ type: "symbols", names: symbols });
  }

  const teaser = input.excerpt ? firstReadableExcerpt(input.excerpt) : null;
  if (teaser) {
    const titleStart = title.slice(0, 40).toLowerCase();
    const teaserStart = teaser.slice(0, 40).toLowerCase();
    if (!teaserStart.startsWith(titleStart) && titleStart !== teaserStart) {
      blocks.push({ type: "insight", text: teaser });
    }
  }

  return blocks;
}

function blockToPlainLine(block: SharePreviewBlock): string | null {
  switch (block.type) {
    case "eyebrow":
      return block.text.toUpperCase();
    case "master":
      return `Мастер ${block.name}`;
    case "date":
      return block.text;
    case "topic":
      return `«${block.question}»`;
    case "title":
      return block.text;
    case "symbols":
      return `Символы · ${block.names}`;
    case "insight":
      return block.text;
    default:
      return null;
  }
}

/** Строки для plain-text мессенджеров. */
export function buildSharePreviewLines(
  titleOrInput: string | ShareMessageInput,
  masterName?: string
): string[] {
  const blocks = buildSharePreviewBlocks(titleOrInput, masterName);
  const lines: string[] = [];

  for (const block of blocks) {
    const line = blockToPlainLine(block);
    if (!line) continue;
    if (block.type === "topic") {
      lines.push("Вопрос");
      lines.push(line);
      continue;
    }
    if (block.type === "insight") {
      lines.push("Из расклада");
      lines.push(line);
      continue;
    }
    lines.push(line);
  }

  return lines;
}

export function buildShareLinkPreviewTitle(
  titleOrInput: string | ShareMessageInput,
  masterName?: string
): string {
  const input = normalizeShareMessageInput(titleOrInput, masterName);
  const kind = shareKindLabel(input.kind);
  const master = input.masterName?.trim();
  if (master) return `${kind} · ${master}`;
  return `${kind} · ${BRAND_NAME}`;
}

/** Короткий продающий текст для OG / мессенджеров. */
export function buildShareHook(
  titleOrInput: string | ShareMessageInput,
  masterName?: string
): string {
  return buildSharePreviewLines(titleOrInput, masterName).join("\n");
}

export function formatShareUrlShort(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

/** Сообщение для Telegram / native: текст + ссылка внизу. */
export function buildShareLinkMessage(
  titleOrInput: string | ShareMessageInput,
  url: string,
  masterName?: string
): string {
  const body = buildShareHook(titleOrInput, masterName);
  return `${body}\n\n—\nОткрыть расклад →\n${url}`;
}

/** Telegram: один блок текста — без дубля URL сверху. */
export function buildTelegramShareUrl(
  pageUrl: string,
  titleOrInput: string | ShareMessageInput,
  masterName?: string
): string {
  const message = buildShareLinkMessage(titleOrInput, pageUrl, masterName);
  return `https://t.me/share/url?text=${encodeURIComponent(message)}`;
}

export function buildChannelUrl(
  channel: ShareChannel,
  shareUrl: string,
  titleOrInput: string | ShareMessageInput,
  masterName?: string
): string | null {
  switch (channel) {
    case "telegram":
      return buildTelegramShareUrl(shareUrl, titleOrInput, masterName);
    case "vk": {
      const hook = buildShareHook(titleOrInput, masterName);
      const headline = buildShareLinkPreviewTitle(titleOrInput, masterName);
      return `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(headline)}&comment=${encodeURIComponent(hook)}`;
    }
    case "copy":
    case "download":
    case "native":
      return null;
    default:
      return null;
  }
}

/** @deprecated */
export function buildShareBody(title: string, excerpt: string): string {
  return buildShareHook({ title, excerpt });
}

/** @deprecated */
export function buildShareTextForCopy(title: string, _excerpt: string, url: string, masterName?: string): string {
  return buildShareLinkMessage(title, url, masterName);
}

/** @deprecated */
export function buildShareText(title: string, _excerpt: string, url: string, masterName?: string): string {
  return buildShareLinkMessage(title, url, masterName);
}

export function shareOgImageUrl(token: string): string {
  return `/api/share/${encodeURIComponent(token)}/og`;
}

export function shareOgImageAbsoluteUrl(token: string): string {
  return `${getAppUrl()}${shareOgImageUrl(token)}`;
}
