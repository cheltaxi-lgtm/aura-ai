import Link from "next/link";
import { BRAND_NAME, BRAND_TAGLINE, BRAND_URL, getAppUrl } from "@/lib/brand";
import { appShellStartUrl } from "@/lib/app-shell";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import type { Metadata } from "next";

export const metadata: Metadata = buildSeoMetadata({
  title: `Приложение ${BRAND_NAME} для Android`,
  description: `Скачайте официальное приложение ${BRAND_NAME} — оракул в кармане: расклады, мастера, фото-расклад и напоминания.`,
  path: "/app",
});

function apkUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ANDROID_APK_URL?.trim();
  if (fromEnv) return fromEnv;
  return `${getAppUrl()}/releases/zovus-latest.apk`;
}

export default function AppDownloadPage() {
  const downloadHref = apkUrl();
  const webAppHref = appShellStartUrl(getAppUrl());

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm uppercase tracking-[0.2em] text-aura-champagne/80">Официальное приложение</p>
      <h1 className="mt-3 font-display text-4xl font-bold text-white md:text-5xl">
        {BRAND_NAME} для Android
      </h1>
      <p className="mt-4 text-lg text-gray-300">
        {BRAND_TAGLINE} — полноэкранный режим, быстрый доступ с домашнего экрана и премиальная оболочка
        поверх {BRAND_URL.replace(/^https:\/\//, "")}.
      </p>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        <a
          href={downloadHref}
          className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-amber-700 to-amber-500 px-8 py-4 text-center font-semibold text-black transition hover:brightness-110"
        >
          Скачать APK
        </a>
        <Link
          href={webAppHref}
          className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-8 py-4 text-center text-white transition hover:border-aura-champagne/40"
        >
          Открыть в браузере
        </Link>
      </div>

      <section className="mt-14 rounded-3xl border border-white/10 bg-black/40 p-6">
        <h2 className="font-display text-xl text-white">Как установить</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-gray-300">
          <li>Нажмите «Скачать APK» и дождитесь загрузки файла.</li>
          <li>Если браузер спросит — разрешите установку из этого источника.</li>
          <li>Откройте скачанный файл и подтвердите установку.</li>
          <li>Запустите {BRAND_NAME} с домашнего экрана.</li>
        </ol>
        <p className="mt-4 text-sm text-gray-500">
          Обновления приложения подтягивают новый интерфейс с сайта автоматически; APK нужен только для
          обновления нативной оболочки.
        </p>
      </section>
    </main>
  );
}
