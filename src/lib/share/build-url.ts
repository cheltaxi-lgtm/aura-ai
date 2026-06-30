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

export function buildShareText(title: string, excerpt: string, url: string): string {
  const lines = ["🔮 Мой расклад Zovus", "", title];
  if (excerpt) lines.push("", excerpt);
  lines.push("", `Получить свой расклад: ${url}`);
  return lines.join("\n");
}

export function buildChannelUrl(
  channel: ShareChannel,
  shareUrl: string,
  text: string
): string | null {
  switch (channel) {
    case "telegram":
      return `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text.split("\n\nПолучить")[0] ?? text)}`;
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${text}`)}`;
    case "vk":
      return `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(text.split("\n")[0] ?? "Zovus")}`;
    case "copy":
    case "png":
    case "native":
      return null;
    default:
      return null;
  }
}
