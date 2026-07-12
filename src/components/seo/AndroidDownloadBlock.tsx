"use client";

import { Smartphone } from "lucide-react";
import AppDownloadButton from "@/components/AppDownloadButton";
import { shouldUseAppShellClient } from "@/lib/app-shell";

export default function AndroidDownloadBlock() {
  if (shouldUseAppShellClient()) return null;

  return (
    <section className="aura-landing-section aura-landing-section--app-download">
      <div className="aura-landing-app-download mx-auto max-w-3xl text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-aura-gold/30 bg-aura-gold/10">
          <Smartphone className="h-6 w-6 text-aura-champagne" aria-hidden />
        </div>
        <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">
          Zovus в кармане
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-gray-300 sm:text-base">
          Установите официальное приложение для Android: быстрый доступ с домашнего экрана,
          полноэкранный режим и те же расклады, что на сайте.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <AppDownloadButton />
        </div>
      </div>
    </section>
  );
}
