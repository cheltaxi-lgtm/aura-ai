"use client";

import type { ShareChannel } from "@/lib/share/types";
import { buildChannelUrl, buildSharePageUrl, buildShareText } from "@/lib/share/build-url";

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function downloadShareOgImage(token: string, filename: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(token)}/og`, { cache: "no-store" });
    if (!res.ok) return false;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = filename;
    link.href = objectUrl;
    link.click();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch {
    return false;
  }
}

export async function exportCardAsPng(element: HTMLElement, filename: string): Promise<boolean> {
  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(element, {
      backgroundColor: "#0a0a0f",
      scale: 2,
      useCORS: true,
    });
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
    return true;
  } catch {
    return false;
  }
}

export async function nativeShare(options: {
  title: string;
  text: string;
  url: string;
  file?: File;
}): Promise<"shared" | "cancelled" | "failed"> {
  if (typeof navigator === "undefined" || !navigator.share) return "failed";
  try {
    const shareData: ShareData = {
      title: options.title,
      text: options.text,
      url: options.url,
    };
    if (options.file && navigator.canShare?.({ files: [options.file] })) {
      await navigator.share({ ...shareData, files: [options.file] });
    } else {
      await navigator.share(shareData);
    }
    return "shared";
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return "cancelled";
    return "failed";
  }
}

export function openShareChannel(
  channel: ShareChannel,
  token: string,
  title: string,
  excerpt: string
): "opened" | "copied" | "unsupported" {
  const url = buildSharePageUrl(token, channel);
  const text = buildShareText(title, excerpt, url);
  const channelUrl = buildChannelUrl(channel, url, text, title, excerpt);

  if (channelUrl && typeof window !== "undefined") {
    window.open(channelUrl, "_blank", "noopener,noreferrer");
    return "opened";
  }

  return "unsupported";
}

export async function shareViaNative(
  token: string,
  title: string,
  excerpt: string,
  cardElement?: HTMLElement | null
): Promise<"shared" | "copied" | "failed"> {
  const url = buildSharePageUrl(token, "native");
  const text = buildShareText(title, excerpt, url);

  if (cardElement) {
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}/og`, { cache: "no-store" });
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], "zovus-reading.png", { type: "image/png" });
        const result = await nativeShare({ title, text, url, file });
        if (result === "shared") return "shared";
      }
    } catch {
      /* fall through */
    }
  }

  const result = await nativeShare({ title, text, url });
  if (result === "shared") return "shared";

  const copied = await copyToClipboard(text);
  return copied ? "copied" : "failed";
}
