"use client";

import type { ShareChannel } from "@/lib/share/types";
import {
  buildChannelUrl,
  buildShareBody,
  buildSharePageUrl,
  buildShareTextForCopy,
} from "@/lib/share/build-url";

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

export async function nativeShare(options: {
  title: string;
  text: string;
  url?: string;
  file?: File;
}): Promise<"shared" | "cancelled" | "failed"> {
  if (typeof navigator === "undefined" || !navigator.share) return "failed";
  try {
    const shareData: ShareData = { title: options.title, text: options.text };
    if (options.url) shareData.url = options.url;
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
  const channelUrl = buildChannelUrl(channel, url, title, excerpt);

  if (channelUrl && typeof window !== "undefined") {
    window.open(channelUrl, "_blank", "noopener,noreferrer");
    return "opened";
  }

  return "unsupported";
}

export async function shareViaNative(
  token: string,
  title: string,
  excerpt: string
): Promise<"shared" | "copied" | "failed"> {
  const url = buildSharePageUrl(token, "native");
  const text = buildShareBody(title, excerpt);

  try {
    const res = await fetch(`/api/share/${encodeURIComponent(token)}/og`, { cache: "no-store" });
    if (res.ok) {
      const blob = await res.blob();
      const file = new File([blob], "zovus-reading.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        const result = await nativeShare({ title, text, url, file });
        if (result === "shared") return "shared";
      }
    }
  } catch {
    /* fall through */
  }

  const result = await nativeShare({ title, text, url });
  if (result === "shared") return "shared";

  const copied = await copyToClipboard(buildShareTextForCopy(title, excerpt, url));
  return copied ? "copied" : "failed";
}
