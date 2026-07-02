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

/** Короткий продающий текст для мессенджеров — без тела расклада. */
export function buildShareHook(title: string, masterName?: string): string {
  return buildSharePreviewLines(title, masterName).join("\n");
}

/** Строки превью в ShareSheet — без пустых строк и дублей. */
export function buildSharePreviewLines(title: string, masterName?: string): string[] {
  const lines = ["🔮 Посмотри мой расклад на Zovus", `«${title.trim()}»`];
  if (masterName?.trim()) lines.push(`Мастер: ${masterName.trim()}`);
  lines.push("Полный текст — по ссылке 👇");
  return lines;
}

/** Сообщение для копирования / native: хук + ссылка. */
export function buildShareLinkMessage(title: string, url: string, masterName?: string): string {
  return `${buildShareHook(title, masterName)}\n\n${url}`;
}

export function buildTelegramShareUrl(pageUrl: string, title: string, masterName?: string): string {
  const text = buildShareHook(title, masterName);
  return `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(text)}`;
}

export function buildChannelUrl(
  channel: ShareChannel,
  shareUrl: string,
  title: string,
  masterName?: string
): string | null {
  switch (channel) {
    case "telegram":
      return buildTelegramShareUrl(shareUrl, title, masterName);
    case "vk": {
      const hook = buildShareHook(title, masterName);
      return `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(hook.split("\n")[0] ?? "Zovus")}&comment=${encodeURIComponent(hook)}`;
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
  return buildShareHook(title);
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
