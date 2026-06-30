import { getAppUrl } from "@/lib/brand";
import type { ShareChannel } from "./types";

const MAX_MESSENGER_URL_LEN = 3800;

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

/** Full share body — title + excerpt, без ссылки. */
export function buildShareBody(title: string, excerpt: string): string {
  const lines = ["🔮 Мой расклад Zovus", "", title.trim()];
  const body = excerpt.trim();
  if (body) lines.push("", body);
  return lines.join("\n");
}

/** Для копирования: полный текст + одна ссылка в конце. */
export function buildShareTextForCopy(title: string, excerpt: string, url: string): string {
  return `${buildShareBody(title, excerpt)}\n\n${url}`;
}

function truncateExcerptToFit(
  title: string,
  excerpt: string,
  url: string,
  prefix: string,
  suffix: string,
  maxUrlLen: number
): string {
  const header = buildShareBody(title, "");
  const full = `${header}\n\n${excerpt.trim()}${suffix}`;
  if (prefix.length + encodeURIComponent(full).length <= maxUrlLen) {
    return full;
  }

  let lo = 0;
  let hi = excerpt.length;
  let best = "";

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = excerpt.slice(0, mid).trim();
    const candidate = slice
      ? `${header}\n\n${slice}…${suffix}`
      : `${header}${suffix}`;
    if (prefix.length + encodeURIComponent(candidate).length <= maxUrlLen) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best || `${header}${suffix}`;
}

export function buildTelegramShareUrl(pageUrl: string, title: string, excerpt: string): string {
  const prefix = `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=`;
  const text = truncateExcerptToFit(title, excerpt, pageUrl, prefix, "", MAX_MESSENGER_URL_LEN);
  return prefix + encodeURIComponent(text);
}

export function buildWhatsAppShareUrl(pageUrl: string, title: string, excerpt: string): string {
  const prefix = "https://wa.me/?text=";
  const suffix = `\n\n${pageUrl}`;
  const text = truncateExcerptToFit(title, excerpt, pageUrl, prefix, suffix, MAX_MESSENGER_URL_LEN);
  return prefix + encodeURIComponent(text);
}

export function buildChannelUrl(
  channel: ShareChannel,
  shareUrl: string,
  title: string,
  excerpt: string
): string | null {
  switch (channel) {
    case "telegram":
      return buildTelegramShareUrl(shareUrl, title, excerpt);
    case "whatsapp":
      return buildWhatsAppShareUrl(shareUrl, title, excerpt);
    case "vk":
      return `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(title)}`;
    case "copy":
    case "png":
    case "native":
      return null;
    default:
      return null;
  }
}

/** @deprecated use buildShareBody / buildShareTextForCopy */
export function buildShareText(title: string, excerpt: string, url: string): string {
  return buildShareTextForCopy(title, excerpt, url);
}
