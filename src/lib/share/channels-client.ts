"use client";

import type { ShareChannel } from "@/lib/share/types";
import {
  buildChannelUrl,
  buildShareLinkMessage,
  buildSharePageUrl,
  shareOgImageUrl,
  type ShareMessageInput,
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

export async function fetchShareOgBlob(token: string): Promise<Blob | null> {
  try {
    const res = await fetch(shareOgImageUrl(token), { cache: "no-store" });
    if (!res.ok) return null;
    return res.blob();
  } catch {
    return null;
  }
}

export async function downloadShareOgImage(token: string, filename: string): Promise<boolean> {
  const blob = await fetchShareOgBlob(token);
  if (!blob) return false;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = objectUrl;
  link.click();
  URL.revokeObjectURL(objectUrl);
  return true;
}

export function openShareChannel(
  channel: ShareChannel,
  token: string,
  input: ShareMessageInput
): "opened" | "unsupported" {
  const trackedUrl = buildSharePageUrl(token, channel);
  const cleanUrl = buildSharePageUrl(token);
  const shareUrl = channel === "telegram" ? cleanUrl : trackedUrl;
  const channelUrl = buildChannelUrl(channel, shareUrl, input);

  if (channelUrl && typeof window !== "undefined") {
    window.open(channelUrl, "_blank", "noopener,noreferrer");
    return "opened";
  }

  return "unsupported";
}

/** Картинка + короткий текст + ссылка (без тела расклада). */
export async function shareViaNative(
  token: string,
  input: ShareMessageInput
): Promise<"shared" | "copied" | "failed"> {
  const url = buildSharePageUrl(token, "native");
  const text = buildShareLinkMessage(input, url);

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      const blob = await fetchShareOgBlob(token);
      if (blob && navigator.canShare?.({ files: [new File([blob], "zovus-reading.png", { type: "image/png" })] })) {
        const file = new File([blob], "zovus-reading.png", { type: "image/png" });
        await navigator.share({
          title: input.title.slice(0, 100),
          text,
          files: [file],
        });
        return "shared";
      }
      await navigator.share({ title: input.title.slice(0, 100), text });
      return "shared";
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return "failed";
    }
  }

  const copied = await copyToClipboard(text);
  return copied ? "copied" : "failed";
}
