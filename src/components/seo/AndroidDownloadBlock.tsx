"use client";

import { Smartphone } from "lucide-react";
import AppDownloadButton from "@/components/AppDownloadButton";
import { shouldUseAppShellClient } from "@/lib/app-shell";

export default function AndroidDownloadBlock() {
  if (shouldUseAppShellClient()) return null;

  return (
    <section className="mx-auto mt-10 max-w-3xl rounded-3xl border border-aura-gold/20 bg-gradient-to-br from-aura-gold/10 via-black/40 to-black/60 p-6 text-center sm:p-8">
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
      <div className="mt-6 flex justify-center">
        <AppDownloadButton />
      </div>
    </section>
  );
}
