"use client";

import Link from "next/link";
import { Download, Smartphone } from "lucide-react";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { WEB_DOWNLOAD_BTN, WEB_DOWNLOAD_BTN_COMPACT } from "@/lib/web-download-ui";

const APK_URL =
  process.env.NEXT_PUBLIC_ANDROID_APK_URL?.trim() || "/releases/zovus-latest.apk";

type AppDownloadButtonProps = {
  /** Compact pill for header; default is full CTA button. */
  compact?: boolean;
  className?: string;
};

export default function AppDownloadButton({ compact = false, className = "" }: AppDownloadButtonProps) {
  if (shouldUseAppShellClient()) return null;

  if (compact) {
    return (
      <Link
        href={APK_URL}
        download
        className={`${WEB_DOWNLOAD_BTN_COMPACT} ${className}`}
        aria-label="Скачать приложение Zovus для Android"
      >
        <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Скачать
      </Link>
    );
  }

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center ${className}`}>
      <a href={APK_URL} download className={WEB_DOWNLOAD_BTN}>
        <Download className="h-5 w-5" aria-hidden />
        Скачать
      </a>
      <Link href="/app" className={WEB_DOWNLOAD_BTN}>
        Подробнее об приложении
      </Link>
    </div>
  );
}
