import { getAppUrl } from "@/lib/brand";
import { truncateForShareMessage } from "./sanitize";
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

export function buildShareTeaser(excerpt: string): string {
  return truncateForShareMessage(excerpt);
}

export function buildShareText(title: string, excerpt: string, url: string): string {
  const lines = ["🔮 Мой расклад Zovus", "", title.trim()];
  const teaser = buildShareTeaser(excerpt);
  if (teaser) {
    lines.push("", teaser);
    if (excerpt.trim().length > teaser.length) {
      lines.push("", `Читать полностью: ${url}`);
    }
  }
  lines.push("", `Получить свой расклад: ${url}`);
  return lines.join("\n");
}

export function buildTelegramShareText(title: string, excerpt: string): string {
  const lines = ["🔮 Мой расклад Zovus", title.trim()];
  const teaser = buildShareTeaser(excerpt);
  if (teaser) lines.push(teaser);
  return lines.join("\n\n");
}

export function buildChannelUrl(
  channel: ShareChannel,
  shareUrl: string,
  text: string,
  title?: string,
  excerpt?: string
): string | null {
  switch (channel) {
    case "telegram": {
      const tgText = buildTelegramShareText(title ?? text.split("\n")[0] ?? "Zovus", excerpt ?? "");
      return `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(tgText)}`;
    }
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(text)}`;
    case "vk":
      return `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(title ?? "Zovus")}&comment=${encodeURIComponent(buildShareTeaser(excerpt ?? ""))}`;
    case "copy":
    case "png":
    case "native":
      return null;
    default:
      return null;
  }
}
