import { getAppUrl } from "@/lib/brand";
import { truncateForShareUrl } from "./sanitize";
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

/** Full text for copy / native share / landing reference. */
export function buildShareText(title: string, excerpt: string, url: string): string {
  const lines = ["🔮 Мой расклад Zovus", "", title.trim()];
  const body = excerpt.trim();
  if (body) lines.push("", body);
  lines.push("", `Ссылка: ${url}`);
  return lines.join("\n");
}

/** Shorter body for messenger deep links (URL length limits). */
export function buildMessengerShareText(title: string, excerpt: string, url: string): string {
  const lines = ["🔮 Мой расклад Zovus", title.trim()];
  const body = truncateForShareUrl(excerpt);
  if (body) lines.push(body);
  if (excerpt.trim().length > body.length) {
    lines.push("", `Читать полностью: ${url}`);
  } else {
    lines.push("", url);
  }
  return lines.join("\n\n");
}

export function buildTelegramShareText(title: string, excerpt: string, url: string): string {
  const lines = ["🔮 Мой расклад Zovus", title.trim()];
  const body = truncateForShareUrl(excerpt, 900);
  if (body) lines.push(body);
  if (excerpt.trim().length > body.length) {
    lines.push("Читать полностью на Zovus ↓");
  }
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
      const tgText = buildTelegramShareText(
        title ?? "Zovus",
        excerpt ?? "",
        shareUrl
      );
      return `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(tgText)}`;
    }
    case "whatsapp": {
      const waText = buildMessengerShareText(title ?? "Zovus", excerpt ?? "", shareUrl);
      return `https://wa.me/?text=${encodeURIComponent(waText)}`;
    }
    case "vk":
      return `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(title ?? "Zovus")}&comment=${encodeURIComponent(truncateForShareUrl(excerpt ?? "", 500))}`;
    case "copy":
    case "png":
    case "native":
      return null;
    default:
      return null;
  }
}
