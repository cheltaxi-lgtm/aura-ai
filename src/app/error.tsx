"use client";

import { useEffect } from "react";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";

const RELOAD_KEY = "aura_stale_client_reload_v2";

/** Stale tab after deploy: old chunks / server actions no longer match. */
function isStaleClientError(error: Error): boolean {
  const msg = error.message ?? "";
  return (
    error.name === "ChunkLoadError" ||
    msg.includes("Loading chunk") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Failed to find Server Action") ||
    msg.includes("was not found on the server")
  );
}

function hardReload(): void {
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!isStaleClientError(error) || typeof window === "undefined") return;
    if (!sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, "1");
      hardReload();
    }
  }, [error]);

  const handleRetry = () => {
    if (typeof window !== "undefined" && isStaleClientError(error)) {
      sessionStorage.removeItem(RELOAD_KEY);
      hardReload();
      return;
    }
    reset();
  };

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <BrandMark size={40} className="mb-4" />
      <h1 className="font-display mb-2 text-3xl font-bold text-white">Что-то пошло не так</h1>
      <p className="mb-8 max-w-sm text-sm text-gray-400">
        Временная ошибка на стороне сервиса. Попробуйте обновить страницу или вернитесь на главную.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={handleRetry} className="btn-neon px-8 py-3 text-sm">
          Повторить
        </button>
        <Link href="/" className="btn-luxe btn-luxe--sm btn-luxe--gold px-8 py-3 text-sm">
          На главную
        </Link>
      </div>
    </div>
  );
}
