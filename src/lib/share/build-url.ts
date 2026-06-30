import { getAppUrl } from "@/lib/brand";
import type { ShareChannel } from "./types";

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

export function buildTelegramShareUrl(pageUrl: string, title: string, excerpt: string): string {
  const prefix = `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=`;
  const intro = buildShareBody(title, "");
  const teaser = excerpt.trim().slice(0, 240);
  const text =
    teaser && teaser.length < excerpt.trim().length
      ? `${intro}\n\n${teaser}…`
      : teaser
        ? `${intro}\n\n${teaser}`
        : intro;
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
